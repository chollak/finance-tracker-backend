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
6. close database on `SIGTERM` / `SIGINT`

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
