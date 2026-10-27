# Deployment Guide

> **⚠️ Not the active path (as of 2026-08-16).** Production/AWS deployment is parked: the prod host was removed from the active plan on 2026-08-13, and `sapaev.uz` / Supabase are not current targets. Current work is local-only — WSL + SQLite + Telegram polling + Cloudflare quick tunnel for phone testing.
>
> Source of truth for current work: [TASKS.md](TASKS.md) (текущий фокус) and [CLAUDE.md](CLAUDE.md).
> For local setup, use [docs/knowledge-base/08-development/quick-start.md](docs/knowledge-base/08-development/quick-start.md).
> The live instance runs on Shukur's PC (WSL, systemd, `tailscale serve`): [docs/knowledge-base/08-development/live-instance.md](docs/knowledge-base/08-development/live-instance.md) (FT-156).
>
> The Docker/Node sections below describe the current packaging commands. There is no server-side deploy: the SSH deploy to AWS was removed in FT-158 (see [GitHub Actions](#github-actions)).

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

GitHub Actions only checks the code; nothing deploys from it. `verify.yml` runs `npm run verify` on every pull request, `quality-gate.yml` on every push to `main`; both take Node.js from `.nvmrc`.

The SSH deploy job (`deploy.yml`) and the scheduled `docker-cleanup.yml` reached the AWS host that was removed from the plan on 2026-08-13; both were deleted in FT-158. The live instance moves to Shukur's PC and is updated there by hand (FT-156).
