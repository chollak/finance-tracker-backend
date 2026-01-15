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

**Optional (Notion support deprecated):**
- `NOTION_API_KEY` and `NOTION_DATABASE_ID` - Legacy support only

See `.env.example` for full configuration options.

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

```bash
cd webapp
npm install
npm run dev
```

### Building for production

```bash
cd webapp
npm run build
```

The build outputs static files to `public/webapp/` so they can be served by the
backend.

## Web App Features

The React frontend provides 5 main pages:

- **HomePage** (`/`) - Balance overview and quick access
- **Dashboard** (`/dashboard`) - Financial health score, alerts, analytics
- **Transactions** (`/transactions`) - Search, filter, edit, delete transactions
- **Budgets** (`/budgets`) - Create/edit budgets, track spending, alerts
- **Stats** (`/stats`) - Monthly income/expense statistics

See [USER_GUIDE.md](USER_GUIDE.md) for detailed usage instructions.

## Running Tests

Unit tests are executed with Jest:

```bash
npm test
```

## GitHub Actions

The `deploy` workflow in `.github/workflows/deploy.yml` runs on pushes to the `main` branch and performs the following steps:

1. Sets up Node.js 18 using `actions/setup-node`.
2. Installs dependencies with `npm ci`.
3. Executes tests with `npm test`.
4. Deploys the application to your server over SSH, where the container is built using `docker compose`.
5. Ensure that the repository secrets `SSH_HOST`, `SSH_USER` and `SSH_KEY` are configured with your server details so the SSH deployment step can connect.

## Project Structure

The code follows Clean Architecture principles with layers for `domain`, `application`, `infrastructure`, and `interfaces`. Express configuration lives under `src/framework/express`.

### Module interactions

The `voiceProcessing` module depends on the `transaction` module through the `CreateTransactionUseCase`. Voice commands are transcribed and immediately recorded as transactions. Both modules are instantiated once in `createModules()` and shared between the HTTP server and the Telegram bot.

### Database Architecture

The application supports dual database backends:
- **SQLite** - File-based database (`data/database.sqlite`) for development
- **Supabase** - Cloud PostgreSQL for production scaling

Switch via `DATABASE_TYPE` environment variable. Repository pattern abstracts
database implementation - same code works with both backends.
