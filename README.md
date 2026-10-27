# Finance Tracker Backend

AI-powered finance tracking with voice/text input processing using OpenAI.
Supports SQLite (default) and Supabase databases.

## Prerequisites

- Node.js >= 18
- npm
- ffmpeg (for converting voice messages)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and configure:

**Required:**
- `OPENAI_API_KEY` - For voice transcription and transaction parsing
- `TG_BOT_API_KEY` - Telegram bot token
- `WEB_APP_URL` - Public URL for the web application

**Database (choose one):**
- `DATABASE_TYPE=sqlite` (default, no additional config needed)
- `DATABASE_TYPE=supabase` (requires SUPABASE_URL and SUPABASE_ANON_KEY)

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

For Telegram Mini App testing on a phone, use the repo-local helper so the public HTTPS tunnel, `.env` `WEB_APP_URL`, and Telegram persistent menu button stay in sync:

```bash
# Replace with your Telegram chat/user id.
npm run dev:miniapp -- --chat-id=131184740
```

Useful focused commands:

```bash
# Inspect current WEB_APP_URL and Telegram menu button without printing the bot token.
npm run miniapp:menu -- status --chat-id=131184740

# If you already have a public HTTPS tunnel, update .env + Telegram menu button.
npm run miniapp:menu -- set --url=https://example.trycloudflare.com --chat-id=131184740
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

Routes are defined in `webapp/src/app/router/routes.tsx`:

| Route | Page |
|-------|------|
| `/` | Home — balance overview, quick access |
| `/add` | Manual entry — own keypad, account, category, date, note (FT-113) |
| `/transactions` | Transactions list — search, filter, edit, delete |
| `/?record=<id>` | Home with the record sheet open (FT-115; the bot's «Изменить»). A record has no page of its own |
| `/budgets` | Budgets — progress, alerts |
| `/budgets/add` | Create budget form |
| `/budgets/:id/edit` | Edit budget form |
| `/debts` | Debts list |
| `/debts/add` | Create debt form |
| `/debts/:id` | Debt details and payments |
| `/analytics` | Analytics and insights |
| `/more` | Settings and secondary sections |

There is no `/dashboard` or `/stats` route in the webapp; dashboard data is an API concern (`/api/dashboard/:userId`) consumed by the Home and Analytics pages.

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
2. `npm run test:ci` — Jest tests serially (`jest --runInBand`)
3. `npm run test:webapp` — webapp Vitest tests
4. `npm run build:webapp` — webapp production build
5. `npm run analyze` — `dependency-cruiser` + `madge` circular dependency scan

## GitHub Actions

Both workflows set up Node.js from `.nvmrc`, install with `npm ci` and run `npm run verify`:

- **`verify.yml`** — on every pull request.
- **`quality-gate.yml`** — on every push to `main` (and on manual dispatch), so the merged result is checked too.

There is no deploy workflow. The SSH deploy to the AWS host (removed from the plan on 2026-08-13) was deleted in FT-158 together with `docker-cleanup.yml`; the live instance moves to Shukur's PC and is updated there by hand (FT-156). See [TASKS.md](TASKS.md) and [CLAUDE.md](CLAUDE.md).

## Project Structure

The code follows Clean Architecture principles with layers for `domain`, `application`, `infrastructure`, and `presentation`. Express configuration lives under `src/delivery/web/express/`; the Telegram bot lives under `src/delivery/messaging/telegram/`.

### Module interactions

The application is organized into 7 app modules (`TransactionModule`, `BudgetModule`, `DebtModule`, `VoiceProcessingModule`, `OpenAIUsageModule`, `UserModule`, `SubscriptionModule`), created once in `createModules()` (`src/appModules.ts`) and shared between the HTTP server and the Telegram bot. For example, `voiceProcessing` depends on `transaction` through `CreateTransactionUseCase` — voice commands are transcribed and immediately recorded as transactions.

Dashboard is not one of these modules: `src/modules/dashboard/` ships only `DashboardService` and `DashboardController`, which the Express layer assembles in `createDashboardRouter()` from the Transaction analytics service and the Budget service.

See [docs/knowledge-base/01-architecture/modules.md](docs/knowledge-base/01-architecture/modules.md) for the full module dependency graph.

### Database Architecture

The application supports dual database backends:
- **SQLite** - File-based database (`data/database.sqlite`) for development
- **Supabase** - Cloud PostgreSQL for production scaling

Switch via `DATABASE_TYPE` environment variable. Repository pattern abstracts
database implementation - same code works with both backends.
