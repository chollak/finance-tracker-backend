# Quick Start Guide

Быстрый старт для запуска Finance Tracker Backend локально.

## Prerequisites

- **Node.js**: 18+ ([download](https://nodejs.org/))
- **npm**: 8+ (comes with Node.js)
- **SQLite3**: Встроено в Node.js (для SQLite database)
- **Optional**: FFmpeg для voice processing

---

## Environment Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd finance-tracker-backend
```

---

### 2. Install Dependencies

```bash
npm install
```

Это установит:
- Backend dependencies
- Frontend dependencies (автоматически через `postinstall`)
- Скомп илирует webapp в `public/webapp/`

---

### 3. Create .env File

Создайте `.env` файл в корне проекта:

```bash
# Required - Application will fail without these
OPENAI_API_KEY=sk-your-openai-api-key

# Optional Telegram Bot
TG_BOT_API_KEY=your-telegram-bot-token
WEB_APP_URL=http://localhost:3000

# Database Type (default: sqlite)
DATABASE_TYPE=sqlite

# Development
NODE_ENV=development
PORT=3000
```

**Минимальная конфигурация:**
```bash
OPENAI_API_KEY=sk-...
```

### Environment File Policy

- `.env.example` is the only tracked env template.
- `.env` is ignored and used as the default local/Docker env file.
- `.env.local` is ignored and preferred for machine-specific overrides.
- `.env.development` is ignored legacy/local naming; the app does not load it.
- Loading order: existing `process.env` values stay highest priority; then `.env.local` if present; otherwise `.env`.

**Получить OpenAI API Key:**
1. Перейти на [platform.openai.com](https://platform.openai.com/)
2. Sign up / Login
3. Navigate to API keys
4. Create new secret key

---

### 4. Database Initialization

**SQLite (default):**
- Database автоматически создается при первом запуске
- Location: `data/database.sqlite`
- Migrations: Auto-sync в development

**Supabase (optional):**

См. [Database Guide](database-guide.md) для инструкций по миграции.

---

## Running the Application

### Development Mode (RECOMMENDED)

**Full-stack с hot reload:**
```bash
npm run dev:full
```

Это запустит:
- **Backend**: http://localhost:3000 (Express API + static files)
- **Frontend**: http://localhost:5173 (React dev server с hot reload)

API calls автоматически проксируются с frontend на backend.

---

### Alternative Development Modes

**Backend only:**
```bash
npm run dev
```
- Express server на порту 3000
- Serves static webapp build
- Hot reload для backend кода

**Frontend only:**
```bash
npm run dev:frontend
```
- React dev server на 5173
- Требует отдельного запуска backend

**Backend only (alias):**
```bash
npm run dev:backend
```

---

### Production Mode

**Build:**
```bash
npm run build
```

Компилирует TypeScript → JavaScript в `dist/` folder.

**Run:**
```bash
npm run serve
```

Запускает compiled app из `dist/index.js`.

---

## Accessing the Application

### URLs

| Service | URL | Description |
|---------|-----|-------------|
| **Web App** | http://localhost:3000 | React frontend |
| **API** | http://localhost:3000/api | REST API endpoints |
| **Health Check** | http://localhost:3000/api/health | Server status |

### Testing API

**Health Check:**
```bash
curl http://localhost:3000/api/health
```

**Create Transaction:**
```bash
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 500,
    "type": "expense",
    "category": "groceries",
    "description": "Хлеб",
    "userId": "test-user"
  }'
```

> **Note:** `date` is optional and defaults to today. `category` uses English IDs (e.g., "food", "transport", "groceries", "utilities").
> See `src/shared/domain/entities/Category.ts` for full list.

---

## Telegram Bot (Optional)

### 1. Create Bot

1. Open Telegram, search for `@BotFather`
2. Send `/newbot`
3. Follow instructions
4. Copy API token

### 2. Configure

Добавьте в `.env`:
```bash
TG_BOT_API_KEY=123456:ABC-DEF...
WEB_APP_URL=http://localhost:3000
```

### 3. Run

Bot запускается автоматически вместе с backend:

```bash
npm run dev:full
```

### 4. Test

1. Find your bot в Telegram
2. Send `/start`
3. Try voice message or text: "Купил хлеб за 500 рублей"

---

## Docker (Alternative)

### Build and Run

```bash
docker compose up -d --build
```

### View Logs

```bash
docker compose logs -f
```

### Stop

```bash
docker compose down
```

**Docker Config:**
- Base image: Node.js 18 Alpine
- Ports: 3000 (backend)
- Volume: `./data` (for SQLite database)
- Environment: From `.env` file

---

## Development Tools

### Testing

```bash
npm test                  # Run all tests
npm run test:ci           # Run tests serially for CI/Hermes verification
npm test -- --watch      # Watch mode
npm test -- --verbose    # Detailed output
npm test budget          # Run specific test file
```

### Code Quality

```bash
npm run format           # Format code with Prettier
npm run check:deps       # Check dependency rules
npm run check:circular   # Find circular dependencies
npm run analyze          # Run both checks
npm run verify           # Full pre-commit gate: build, test:ci, webapp build, analyze
```

Before committing or pushing, use `npm run verify` as the single source of truth.

### Database

**SQLite Database Location:**
```
data/database.sqlite
```

**Inspect Database:**
```bash
sqlite3 data/database.sqlite

# Commands:
.tables              # List tables
.schema Transaction  # Show table schema
SELECT * FROM transaction LIMIT 10;
```

---

## Environment Variables Reference

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3000` | Server port |
| `DATABASE_TYPE` | `sqlite` | `sqlite` or `supabase` |
| `TG_BOT_API_KEY` | - | Telegram bot token |
| `WEB_APP_URL` | `http://localhost:3000` | Public URL |

### Supabase (if DATABASE_TYPE=supabase)

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Anonymous key |

---

## Common Issues

### Port Already in Use

```bash
# Find process
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

### OpenAI API Key Invalid

```
Error: Invalid API key
```

**Solution:**
- Verify key в `.env` file
- Check for spaces/newlines
- Ensure key has credits

### Database Connection Error

```
Error: SQLITE_CANTOPEN: unable to open database file
```

**Solution:**
```bash
mkdir -p data
chmod 755 data
```

### Frontend не загружается

```bash
# Rebuild webapp
npm run build:webapp
```

---

## Next Steps

- [Adding Features](adding-features.md) - Как добавить новый use case/endpoint
- [Database Guide](database-guide.md) - SQLite vs Supabase
- [Troubleshooting](troubleshooting.md) - Решение проблем
- [Architecture Overview](../01-architecture/overview.md) - Понимание структуры

---

## Quick Reference

```bash
# Development
npm run dev:full         # Full-stack с hot reload
npm run dev              # Backend only
npm test                 # Run tests

# Production
npm run build            # Compile TypeScript
npm run serve            # Run compiled app

# Docker
docker compose up -d --build

# Database
sqlite3 data/database.sqlite
```

---

**Ready to develop!** 🚀

См. также: [PROJECT_DOCUMENTATION.md](../../../PROJECT_DOCUMENTATION.md) для детальной документации.
