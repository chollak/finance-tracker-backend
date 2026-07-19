# Deployment Guide

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
npm run build
npm test -- --runInBand
npm run build:webapp
npm run analyze
```

## Logs

```bash
docker compose logs -f
# or, if using PM2/systemd, use the relevant service logs
```

## GitHub Actions

Deployment workflow lives in `.github/workflows/deploy.yml`. Required GitHub secrets include SSH host/user/key and any deployment-specific environment secrets configured by the workflow.
