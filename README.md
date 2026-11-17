# Kapelka (finance-tracker-backend)

Kapelka is the product: one name for the Telegram bot, the Mini App and the future iOS app (FT-168). The repository
and the npm package keep the name `finance-tracker-backend`.

AI-powered finance tracking with voice/text input processing using OpenAI.
One database: SQLite through TypeORM.

## Prerequisites

- Node.js 22 (`.nvmrc`; `nvm use` picks it up)
- npm
- ffmpeg (for converting voice messages)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and configure:

**Required:**
- `OPENAI_API_KEY` - For voice transcription and transaction parsing; the start stops without it

**Usually set:**
- `TG_BOT_API_KEY` - Telegram bot token; without it the bot is off (`ENABLE_TELEGRAM_POLLING=false` turns it off too)
- `WEB_APP_URL` - Public URL for the web application; the bot links to it only when it is HTTPS
- `ALLOWED_TELEGRAM_IDS` - who may use this instance; empty lets everyone in outside production

With `NODE_ENV=production` the start also stops without `ALLOWED_TELEGRAM_IDS`, and without `TG_BOT_API_KEY` while
polling is on (`AppConfig.validate()` in `src/shared/infrastructure/config/appConfig.ts`).

**Database:**
- `DATABASE_TYPE=sqlite` (default, no additional config needed) — the only one supported: the Supabase path was removed in FT-090

See `.env.example` for full configuration options.

### Environment file policy

Tracked in Git:
- `.env.example` — safe template only

Ignored / local only:
- `.env` — default local and Docker Compose env file
- `.env.local` — machine-specific overrides; loaded before `.env`
- `.env.development` — ignored legacy/local name; not loaded by the app

`AppConfig` keeps existing `process.env` values as highest priority, then loads `.env.local` if present, otherwise `.env`.

## Build and Run

To compile the TypeScript sources and start the application:

```bash
npm run build
npm run serve
```

During development you can run the server with automatic reload:

```bash
npm run dev
```

## Docker Compose

To build and start the application in a container:

```bash
docker compose up -d --build
```

Docker Compose loads environment variables from `.env`, so make sure to create it first (you can copy from `.env.example`).

The service will be available on [http://localhost:3000](http://localhost:3000).
View logs with:

```bash
docker compose logs -f
```

Stop and remove the containers when you're done:

```bash
docker compose down
```

## Web App (Telegram Mini App)

The `webapp/` folder contains a React + TypeScript frontend built with Vite. It
is served by Express at the root path, while the backend API is available under
the `/api` prefix.

### Development

For regular frontend-only work:

```bash
cd webapp
npm install
npm run dev
```

For Telegram Mini App testing on a phone, use the repo-local helper so the public HTTPS tunnel, `WEB_APP_URL` in the env file the app reads (`.env.local` if present, otherwise `.env`), and Telegram persistent menu button stay in sync:

```bash
# <telegram_chat_id> — your Telegram chat/user id; MINIAPP_CHAT_ID in the env file can stand in for --chat-id.
npm run dev:miniapp -- --chat-id=<telegram_chat_id>
```

Useful focused commands:

```bash
# Inspect current WEB_APP_URL and Telegram menu button without printing the bot token.
npm run miniapp:menu -- status --chat-id=<telegram_chat_id>

# If you already have a public HTTPS tunnel, update WEB_APP_URL in the env file + Telegram menu button.
npm run miniapp:menu -- set --url=https://example.trycloudflare.com --chat-id=<telegram_chat_id>
```

Notes:

- Telegram Mini Apps require a public HTTPS URL on a phone; `localhost` is not enough.
- Old `/start` inline buttons keep their embedded URL. After a tunnel changes, send `/start` again and press a fresh button.
- The bottom/menu Mini App button is persisted in Telegram via `setChatMenuButton`; update it whenever the tunnel URL changes.

### Building for production

```bash
cd webapp
npm run build
```

The build outputs static files to `public/webapp/` so they can be served by the
backend.

## Web App Features

Routes are defined in `webapp/src/app/router/appRoutes.tsx` (`routes.tsx` makes the browser router of them). Every
screen below needs a signed-in account (a browser without a session gets the login screen) and opens after the first
launch (FT-109):

| Route | Page |
|-------|------|
| `/` | Home — balance card, month tiles, recent records, quick input |
| `/add` | Manual entry — own keypad, account, category, date, note (FT-113) |
| `/review` | Checking the records a phrase from Home's input made, before «Сохранить» (FT-114) |
| `/transactions` | Transactions list — search, filter, edit, delete |
| `/?record=<id>` | Home with the record sheet open (FT-115; the bot's «Изменить»). A record has no page of its own |
| `/analytics`, `/analytics/categories/:id` | Analytics of the month and of one category (FT-120) |
| `/accounts`, `/accounts/:id`, `/accounts/transfer` | Accounts, one account's operations, a transfer between accounts |
| `/audit` | Spending audit and goals (FT-130, FT-131) |
| `/more`, `/more/categories` | Settings and secondary sections; categories |
| `/offline-voice`, `/offline-receipt` | Voice and receipts without a connection: both are read on the server, so the screen offers manual entry (FT-129) |
| `/dev/pastel` | Component showcase, outside the login; not linked |

There is no `/dashboard` or `/stats` route in the webapp, and no `/api/dashboard` on the server since #205: Home reads `/api/transactions/totals` and `/api/accounts`, Analytics reads `/api/analytics`. Budgets — the `/budgets` screens and `/api/budgets` — are gone since #264, debts — the `/debts` screens and `/api/debts` — since #265.

See [USER_GUIDE.md](USER_GUIDE.md) for detailed usage instructions.

## Running Tests

Unit tests are executed with Jest:

```bash
npm test
```

Before committing or pushing changes, run the full verification gate:

```bash
npm run verify
```

`npm run verify` runs, in order:

1. `npm run build` — backend TypeScript build
2. `npm run typecheck:tests` — types of the tests and `src` with one `tsc` (`tsconfig.test.json`): Jest only translates
   the files and checks no types (#293)
3. `npm run typecheck:scripts` — types of the TypeScript scripts in `scripts/` (`tsconfig.scripts.json`, #297): ts-node
   checks a script only when it runs
4. `npm run lint:webapp` — ESLint over `webapp/` (`webapp/eslint.config.js`); a warning fails it too
   (`--max-warnings 0`, #296)
5. `npm run test:ci` — Jest tests serially (`jest --runInBand`)
6. `npm run test:webapp` — webapp Vitest tests
7. `npm run build:webapp` — webapp production build
8. `npm run check:fonts`, `npm run check:tokens` — self-hosted fonts in the build, generated Pastel tokens up to date
9. `npm run analyze` — `dependency-cruiser` (`check:deps`): layer rules and `no-circular`, type-only imports included

In CI the webapp is built twice: `npm ci` runs `postinstall` (`install:webapp` and `build:webapp`), then `verify` builds
it again. Both stay on purpose: `scripts/live-update.sh` relies on the `postinstall` build, and `verify` has to build the
tree it checks, which locally may be newer than the last install. Skipping one in CI would need `npm ci --ignore-scripts`
(then `sqlite3` gets no native module) or a `postinstall` that behaves differently in CI — not worth ~11 s of a run.

## GitHub Actions

Both workflows set up Node.js from `.nvmrc`, install with `npm ci` and run `npm run verify`:

- **`verify.yml`** — on every pull request.
- **`quality-gate.yml`** — on every push to `main` (and on manual dispatch), so the merged result is checked too.

There is no deploy workflow. The SSH deploy to the AWS host (removed from the plan on 2026-08-13) was deleted in FT-158 together with `docker-cleanup.yml`; the live instance moves to Shukur's PC and is updated there by hand (FT-156). See the task board [Kapelka](https://github.com/users/chollak/projects/1) and [CLAUDE.md](CLAUDE.md).

## Project Structure

The code follows Clean Architecture principles with layers for `domain`, `application`, `infrastructure`, and `presentation`. Express configuration lives under `src/delivery/web/express/`; the Telegram bot lives under `src/delivery/messaging/telegram/`.

### Module interactions

The application is organized into 13 app modules (`TransactionModule`, `VoiceProcessingModule`, `QuickCaptureModule`, `CategoryModule`, `AccountModule`, `UserModule`, `BotMessageModule`, `NotificationModule`, `AuditModule` and others — the full list is in `CLAUDE.md`), created once in `createModules()` (`src/appModules.ts`) and shared between the HTTP server and the Telegram bot. For example, `voiceProcessing` depends on `transaction` through `CreateTransactionUseCase` — voice commands are transcribed and immediately recorded as transactions.

See [docs/knowledge-base/01-architecture/modules.md](docs/knowledge-base/01-architecture/modules.md) for the full module dependency graph.

### Database Architecture

One database path: **SQLite** (`data/database.sqlite`) through TypeORM, in development and on the live instance.
The schema changes only by TypeORM migrations (`src/shared/infrastructure/database/migrations/`), applied on start
after a backup. `DATABASE_TYPE` accepts only `sqlite`. The Supabase path was removed from the app in FT-090, its
scripts and SQL files in #324; modules still depend only on the repository interfaces.
