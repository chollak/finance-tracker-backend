# Runtime / Process Mode Decision

> Status: proposed decision for future implementation. This document does **not** implement scheduler/product automation.

## Context

The current composition root is `src/index.ts`.

Current runtime behavior:

1. validate env through `AppConfig.validate()`
2. initialize database
3. create all modules through `createModules()`
4. start Express API/webapp server
5. start Telegram bot after HTTP server is listening
6. on `SIGTERM` / `SIGINT` — and in production when the bot fails for good — one graceful shutdown: schedulers,
   the bot and the HTTP server at once (each finishes its work in flight), database, exit (FT-154, FT-167, below)

Current npm/runtime entrypoints:

```bash
npm run start      # node dist/index.js
npm run serve      # node dist/index.js
npm run dev        # ts-node-dev src/index.ts
npm run dev:backend
npm run dev:full
```

Current Docker Compose runtime:

```yaml
services:
  app:
    command: default image CMD / npm start behavior
```

There is currently one main process that runs API + static webapp + Telegram bot together.

## Known Gap

`SubscriptionService.processExpiredSubscriptions()` exists and is covered by tests, but no scheduler/worker currently invokes it automatically.

Shukur explicitly paused subscription expiry automation for now. This document is only a process-mode foundation so a later implementation can be deliberate.

## Options Considered

### Option A — Keep single process only

```text
node dist/index.js
```

Runs:

- Express API
- static webapp serving
- Telegram bot polling/payment handlers
- any future background jobs, if added

Pros:

- simplest deployment
- one Docker service
- fewer env vars and operational concepts
- good enough for MVP/small production

Cons:

- API lifecycle and bot polling lifecycle are coupled
- future scheduler jobs would run in every app replica if horizontally scaled
- harder to disable bot or worker in a specific environment
- health of one responsibility can affect the others

### Option B — `APP_MODE=all|api|bot|worker`

Single compiled artifact, explicit process mode:

```bash
APP_MODE=all    node dist/index.js  # API + bot, current behavior
APP_MODE=api    node dist/index.js  # API/static webapp only
APP_MODE=bot    node dist/index.js  # Telegram bot only
APP_MODE=worker node dist/index.js  # scheduled/background jobs only
```

Pros:

- preserves one build artifact
- minimal deployment complexity increase
- enables split Docker Compose/services later without duplicating bootstrap code
- worker/scheduler can be run as exactly one process
- can disable bot in local/CI/staging without code changes

Cons:

- requires refactoring `src/index.ts` into smaller boot functions
- adds another runtime env var
- requires docs and deploy discipline so only one worker runs

### Option C — Separate entrypoint files

Examples:

```text
src/entrypoints/api.ts
src/entrypoints/bot.ts
src/entrypoints/worker.ts
```

Pros:

- clean separation at code level
- each process has an obvious responsibility
- easiest to reason about in large systems

Cons:

- more files/scripts from the start
- risk of duplicated bootstrap/config/module wiring
- heavier than needed for this project right now

## Decision

Recommended future direction: **Option B — `APP_MODE=all|api|bot|worker`**.

Default should be:

```bash
APP_MODE=all
```

That preserves current behavior and avoids a breaking deploy change.

No scheduler or product automation should be implemented as part of this decision document. When background jobs are actually implemented, they should run only in `APP_MODE=worker` or in an explicitly single-instance worker service.

**Update (FT-124):** the first scheduler — the bot's daily summary — runs in the bot's process, as its task asks:
`startTelegramBot()` starts `DailySummaryNotifier` only when the bot polls (no token, `ENABLE_TELEGRAM_POLLING=false`
or `WEBHOOK_MODE=true` — no scheduler). It starts once Telegram has answered for the bot (Telegraf's `onLaunch`),
looks at the clock a minute later and stops whenever polling fails — a `409` conflict with another instance (it
starts again when the retry connects) or a permanent failure. Telegram allows one poller per bot, so a process that
lost the polling to another one does not send; and every notice is claimed in `notifications_log` (unique user +
kind + period) before it is sent, so even two processes over one database send it once. When `APP_MODE` arrives, the notifier moves with the bot (`bot` or
`worker`), not into `api`.

**Update (FT-133):** the goal, subscription and audit reminders (`RemindersNotifier`) are the second scheduler of the
same kind: started and stopped with the daily summary, in the bot's process, on the same one-minute `Ticker`, and every
reminder claimed in `notifications_log` before it is sent.

**Update (FT-144):** a notice whose request never left the machine (`ENOTFOUND` / `EAI_AGAIN` after the Mac wakes,
`ECONNREFUSED`) gives its claim up and is tried on the next tick: the daily summary until its day ends, a reminder
for the rest of the day of its first try. A timeout, a reset or an «unreachable» error may have reached Telegram and
stays `failed`, so nothing is sent twice.

**Update (FT-154): the bot does not die silently.** The live instance runs under systemd with `NODE_ENV=production`
(decision 2026-10-26), and `Restart=` reacts only to the process exiting: a process alive without its bot would be
silent. The rule:

- **When the bot is `failed`.** Polling failed for good: Telegram refused the token (`401`, `404`), a `409` «another
  process polls this token» is still there after `TELEGRAM_POLLING_MAX_RETRIES` launches (default 5, backoff from
  `TELEGRAM_POLLING_RETRY_BASE_MS` 5 s doubling to 40 s, about 75 s in all; until then the state is `retrying`), or any other Telegram error. A bot that could not even be set
  up is `failed` too. Network errors, `429` and `5xx` inside the polling loop are retried by Telegraf itself and never
  get here; a network error on the first `getMe` of a launch is not, so it fails the launch.
- **Production** (`NODE_ENV=production`): `createBotFailureHandler` (`src/delivery/runtime/botFailurePolicy.ts`) logs
  the cause and runs the shared graceful shutdown with exit code `1`; systemd starts the process again.
- **Anywhere else** the app goes on without the bot, as before: development without the bot keeps working.
- **`GET /api/health`** is `503` (`"status": "unhealthy"`) while the bot is `failed`, in every environment; `starting`,
  `retrying`, `running` and `disabled` are `200`. The bot's state stays in the body (`telegramBot`). The webapp's
  offline mode asks this route only whether the server answers, so the server's own JSON `503` still counts as an
  answer there (`serverAnswers`).
- **Graceful shutdown** (`src/delivery/runtime/gracefulShutdown.ts`), the same for `SIGTERM` / `SIGINT` (exit `0`):
  stop the schedulers (daily summary, reminders, USD rate refresh); then at once stop the bot (FT-167, below) and close
  the HTTP server (no new requests; open ones get `HTTP_CLOSE_GRACE_MS`, 5 s, then are cut); close the database, exit.
  A step that throws is logged and the next one runs; after `SHUTDOWN_TIMEOUT_MS` (10 s, under systemd's default
  `TimeoutStopSec` of 90 s) the process exits with the same code whatever still hangs. Only the first call counts: a
  `SIGTERM` during a failure exit does not turn it into exit `0`. Stopping the bot cancels a pending 409 relaunch and
  does not throw when polling never started (Telegraf's «Bot is not running!»), which used to crash the process past
  the shutdown.
- **What the journal shows** before the exit: `Telegram bot polling failed permanently` (the error, `attempts`), then
  `Telegram bot is down for good; exiting so the supervisor restarts the process` (`lastError`, `exitCode`),
  `Shutting down` (`reason`, `exitCode`) and `Shutdown complete` or `Shutdown timed out, exiting anyway`.
- **Restart loop.** A wrong token makes every start end within seconds with exit `1`; a `409` after about 75 s. A start
  backs the database up only when migrations are pending, so a loop does not fill `data/backups/`. For the unit
  (FT-156): `Restart=always` with `RestartSec=10` (or more) — with that spacing systemd's default start limit (5 starts
  in 10 s) is never hit, so the service keeps trying and heals itself once the token is fixed or the other poller
  stops; on systemd 254+ `RestartSteps=` / `RestartMaxDelaySec=` (e.g. 6 steps up to 5 min) slow a long loop down.
  `TimeoutStopSec` must stay above 10 s.

**Update (FT-167): a restart does not drop the updates in flight.** `systemctl restart` happens on every update of the
live instance (`scripts/live-update.sh`). Before, the bot's own `SIGTERM` listener only aborted `getUpdates`: nobody
waited for Telegraf's launch promise, the database closed while a handler was still running (a voice through OpenAI,
say), and the batch's offset was never confirmed, so Telegram sent it again after the restart — a second record if the
first one had been written.

- **The shutdown stops the bot.** The bot no longer listens to signals itself. `startTelegramBot()` returns a handle;
  the shutdown's `stopBot` step calls `stop(BOT_STOP_GRACE_MS)`: polling stops taking updates, Telegraf's loop finishes
  the handlers of its batch and confirms the batch's offset (a short `getUpdates`), the launch promise settles. It waits
  at most `BOT_STOP_GRACE_MS` (5 s), at the same time as the HTTP server's 5 s, so the database closes well inside the
  10 s timeout. A handler still running after that is left to Telegram: its update was not confirmed and comes again.
  A signal while `getMe` is still answering ends the launch there (the bot's `onLaunch` throws), before polling takes
  any update.
- **A message sent again writes nothing twice.** Every record a Telegram message writes carries the message's client
  id `tg-<chat id>-<message id>` (`utils/messageClientId.ts`) — the same unique (user, client id) as the Mini App's
  offline queue (FT-106): the text and voice captures (`<id>`, `<id>:1`, …), the amount after a quick-add category,
  the answer to «Сколько?». First in the text and voice chains, `createRepeatedMessageGuard` looks the id up: when the
  message's records exist, nothing is parsed, downloaded or written; the confirmation is sent only if no recent bot
  message (`bot_messages`) shows those records yet — the process may have stopped before sending it. A record the
  person cancelled stays cancelled. Corrections («не 25, а 28», the answer to «Сумму») write no record and are applied
  again with the same result.
- **The launch count starts anew.** A launch that has polled for `POLLING_STABLE_MS` without an error counts as
  started: the next failure is the first of a new count, so a `409` days later is retried instead of `failed` at once.
  `POLLING_STABLE_MS` is longer than one long poll (50 s) and twice the longest pause between launches (80 s with the
  defaults), so two processes taking the token from each other still reach `failed`.
- **Production needs the token.** With `NODE_ENV=production` and polling on (`ENABLE_TELEGRAM_POLLING` not `false`,
  `WEBHOOK_MODE` not `true`), an empty `TG_BOT_API_KEY` fails `AppConfig.validate()`: the start stops with
  `Configuration validation failed` instead of a silent `disabled` bot with health `200`. With
  `ENABLE_TELEGRAM_POLLING=false` (the `api` preview config, the PC before the move) the start goes on without a token.
- **What the journal shows** on a restart: `Shutting down`, `Stopping Telegram bot`, then `Telegram bot stopped` — or
  `Telegram updates still being handled; Telegram sends them again after the restart` when the 5 s ran out — and
  `Shutdown complete`. After the restart a message sent again logs `Telegram sent a handled message again; its records
  are not written twice`.

## Proposed Mode Semantics

### `APP_MODE=all`

Use for current simple deployment.

Runs:

- database initialization
- Express API
- static webapp serving
- Telegram bot

Does not run future worker jobs unless explicitly decided later. Recommended default for backward compatibility.

### `APP_MODE=api`

Runs:

- database initialization
- Express API
- static webapp serving

Does not run:

- Telegram bot
- worker/scheduler jobs

Useful for:

- API-only deployments
- local frontend/API testing without bot polling
- horizontally scaled web nodes

### `APP_MODE=bot`

Runs:

- database initialization
- module creation
- Telegram bot polling/payment handlers

Does not run:

- Express API
- static webapp serving
- worker/scheduler jobs

Useful for:

- separating Telegram polling from API lifecycle
- preventing multiple bot instances from polling at once

### `APP_MODE=worker`

Runs:

- database initialization
- module creation
- background jobs only

Does not run:

- Express API
- static webapp serving
- Telegram bot

Future jobs may include:

- subscription expiry processing
- expiring-soon notifications
- periodic backups/checks

Important operational rule:

> Run exactly one worker instance unless every job is designed to be distributed/idempotent.

## Suggested Implementation Shape Later

Do this only when implementation is actually needed.

1. Add `APP_MODE` to `AppConfig` with default `all`.
2. Extract boot functions from `src/index.ts`:

```ts
async function bootstrapModules() { ... }
async function startApi(modules) { ... }
async function startBot(modules) { ... }
async function startWorker(modules) { ... }
```

3. Keep graceful shutdown shared.
4. Add scripts:

```json
{
  "start": "node dist/index.js",
  "start:api": "APP_MODE=api node dist/index.js",
  "start:bot": "APP_MODE=bot node dist/index.js",
  "start:worker": "APP_MODE=worker node dist/index.js"
}
```

For cross-platform local Windows support, use shell-specific handling later if needed. Docker/Linux can use direct env prefix.

5. Update Docker Compose only when split deployment is desired:

```yaml
services:
  app:
    environment:
      - APP_MODE=api

  bot:
    environment:
      - APP_MODE=bot

  worker:
    environment:
      - APP_MODE=worker
```

6. Add tests for mode dispatch before refactoring behavior.

## Non-Goals

This document intentionally does not:

- implement `APP_MODE`
- start a scheduler
- invoke `processExpiredSubscriptions()` automatically
- change Docker Compose runtime behavior
- change Telegram bot startup behavior
- change current deploy topology

## Follow-up Backlog

- `FT-017`: Normalize user/API error contracts and make test logging quieter.
- Future scheduler task, when Shukur approves product automation:
  - implement `APP_MODE`
  - add a worker process
  - run `SubscriptionService.processExpiredSubscriptions()` from the worker only
  - add idempotency/locking if multiple workers are ever possible

## Current Recommendation

Keep production running in the existing single-process mode for now.

When the first real background job is approved, implement `APP_MODE=all|api|bot|worker` first, then add the job to worker mode only.
