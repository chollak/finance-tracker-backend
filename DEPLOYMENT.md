# Deployment Guide

> **⚠️ Not the active path (as of 2026-08-16).** Production/AWS deployment is parked: the prod host was removed from the active plan on 2026-08-13, and `sapaev.uz` / Supabase are not current targets. Current work is local-only — WSL + SQLite + Telegram polling + Cloudflare quick tunnel for phone testing.
>
> Source of truth for current work: [TASKS.md](TASKS.md) Active Plan and [CLAUDE.md](CLAUDE.md).
> For local setup, use [docs/knowledge-base/08-development/quick-start.md](docs/knowledge-base/08-development/quick-start.md).
>
> The Docker/Node sections below describe the current packaging commands, but server-side deployment remains parked until a host comes back.

## Overview

Finance Tracker can run directly with Node.js or through Docker Compose. The app serves:

- Express API under `/api`
- Telegram bot polling/webhook integration
- React/Vite webapp from `public/webapp/`

Current supported databases are SQLite and Supabase.

## Required Environment

Create `.env` from `.env.example` and set:

```bash
OPENAI_API_KEY=...
TG_BOT_API_KEY=...
WEB_APP_URL=https://your-domain.example
DATABASE_TYPE=sqlite # or supabase
```

For deployment, keep real values in untracked `.env`; do not commit `.env`, `.env.local`, or `.env.development`. Docker Compose reads `.env`.

For Supabase:

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
```

## Deploy with Docker Compose

```bash
git pull origin main
docker compose up -d --build
docker compose logs -f
```

Persistent local directories mounted into the container:

- `./data:/app/data`
- `./downloads:/app/downloads`
- `./uploads:/app/uploads`

## Deploy with Node.js

```bash
git pull origin main
npm install
npm run build
npm run build:webapp
npm run serve
```

For development:

```bash
npm run dev:full
```

## Database Initialization

SQLite is created automatically by TypeORM when `DATABASE_TYPE=sqlite` and synchronization is enabled for development. For explicit Docker initialization:

```bash
docker compose --profile db-init run --rm db-init
```

For Supabase setup/testing:

```bash
npm run supabase:setup
npm run supabase:test
```

## Verification

```bash
curl http://localhost:3000/api/health
npm run verify
```

`npm run verify` runs backend build → `test:ci` (Jest serially) → `test:webapp` (Vitest) → `build:webapp` → `analyze` (dependency-cruiser + madge).

## Logs

```bash
docker compose logs -f
# or, if using PM2/systemd, use the relevant service logs
```

## GitHub Actions

`.github/workflows/deploy.yml` has two jobs:

- **`quality-gate`** — runs on every push to `main` and on manual dispatch: Node.js 20, `npm ci`, `npm run verify`. Within `deploy.yml`, this is the only job that runs on push, and it needs no server.
- **`deploy`** — SSH deploy via `docker compose`, guarded by `if: github.event_name == 'workflow_dispatch'`, so it never runs automatically.

The deploy job was parked on 2026-08-13: automatic deploys had failed on every push since the last successful one on 2026-01-27 (`dial tcp ***:22: i/o timeout`).

To restore automatic deploys: stand up a host, re-check the `SSH_HOST` / `SSH_USER` / `SSH_KEY` repository secrets against its real address, trigger the workflow manually once and confirm a green run, then remove the `if` condition from the `deploy` job.
