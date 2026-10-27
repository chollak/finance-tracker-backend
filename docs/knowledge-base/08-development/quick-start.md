# Quick Start Guide

Быстрый старт для запуска Finance Tracker Backend локально.

## Prerequisites

- **Node.js**: 22 (`.nvmrc`; `nvm use`). Webapp на Vite 7 и Vitest 4 требует 20.19+, на Node 16–18 `npm install` падает на сборке webapp
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
# Who may use this instance: Telegram user ids, comma-separated (FT-153). Empty lets everyone in;
# required with NODE_ENV=production
ALLOWED_TELEGRAM_IDS=
# Optional: the bot's @username for the web login link (FT-128); asked from Telegram when empty
TG_BOT_USERNAME=YourBot
WEB_APP_URL=http://localhost:3000
# Set false to run API without Telegram polling
ENABLE_TELEGRAM_POLLING=true
# Reserved for webhook deployments; skips polling when true
WEBHOOK_MODE=false

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

- `.env.example` is the tracked env template for development; `ops/live/env.local.example` — for the live instance on
  the PC (FT-156, [live-instance.md](live-instance.md)).
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
- Схема меняется только миграциями TypeORM (FT-090). При старте приложение само применяет недостающие миграции, предварительно копируя базу в `data/backups/`. `synchronize` выключен, `DB_SYNCHRONIZE` больше не используется.
- Вручную: `npm run migration:show`, `npm run migration:run`, `npm run migration:revert`. Подробности — [Database Guide](database-guide.md).

Supabase как отдельный путь к базе убран (решение Д6 вехи 10).

---

## Running the Application

### Живой экземпляр (ПК с Windows + WSL)

Daftar для ежедневного пользования — systemd-сервис на ПК с WSL: копия `~/daftar-live` на `main`, `NODE_ENV=production`,
постоянный адрес `https://<пк>.<tailnet>.ts.net` через `tailscale serve`, кнопка меню ставится один раз. Установка,
проверка, логи и откат — [live-instance.md](live-instance.md) (FT-156). Обновление — одна команда в живой копии:

```bash
scripts/live-update.sh
```

До переезда (FT-159) живой экземпляр ещё работает на маке через `npm run dev:miniapp`.

### Phone / Telegram Mini App во время разработки

Для проверки ветки на телефоне с мака: временный адрес Cloudflare quick tunnel. После переезда (FT-159) — со своим
dev-ботом: один токен опрашивает только один процесс.

```bash
# Подставьте свой Telegram chat/user id.
npm run dev:miniapp -- --chat-id=<telegram_chat_id>
```

Что делает команда (`scripts/dev-miniapp.js`):

1. Поднимает Cloudflare quick tunnel и получает публичный HTTPS-адрес. `cloudflared` ищет в `CLOUDFLARED_BIN`,
   `~/.local/bin` (WSL) и в `PATH` (Homebrew на macOS).
2. Записывает этот адрес как `WEB_APP_URL` в тот env-файл, который читает приложение: `.env.local`, если он есть,
   иначе `.env` (`--env-file` меняет выбор).
3. Обновляет постоянную menu-кнопку бота в Telegram через `setChatMenuButton`.
4. Собирает проект и запускает `npm run serve`.
5. Следит за туннелем. Временный туннель не переживает сон компьютера: Cloudflare его удаляет, и `cloudflared` пишет
   `Unauthorized: Tunnel not found`. Тогда (и если `cloudflared` завершился) скрипт поднимает новый туннель, пишет адрес
   в env-файл, обновляет menu-кнопку и перезапускает сервер, который запустил сам: сервер читает `WEB_APP_URL` при
   старте для ссылок бота. Без сети пробует снова через 30 с, 1, 2, 4 и 5 минут. Пока компьютер спит, не работает
   ничего; старые кнопки в чате ведут на прежний адрес — `/start` пришлёт новые.

Точечные команды, если туннель уже поднят:

```bash
# Посмотреть текущие WEB_APP_URL и menu-кнопку. Токен бота не печатается.
npm run miniapp:menu -- status --chat-id=<telegram_chat_id>

# Указать свой готовый HTTPS-адрес: обновит .env и menu-кнопку.
npm run miniapp:menu -- set --url=https://example.trycloudflare.com --chat-id=<telegram_chat_id>
```

Важно:

- Telegram Mini App на телефоне требует публичный HTTPS-адрес; `localhost` не подойдёт.
- Старые inline-кнопки из `/start` хранят прежний URL. После смены туннеля отправьте `/start` заново и нажмите свежую кнопку.
- Скрипты не выводят значение `TG_BOT_API_KEY` — не вставляйте токен в логи и отчёты вручную.

---

### Full-stack Development Mode

**Full-stack с hot reload:**
```bash
npm run dev:full
```

Это запустит:
- **Backend**: http://localhost:3000 (Express API + static files)
- **Frontend**: http://localhost:5173 (React dev server с hot reload)

API calls автоматически проксируются с frontend на backend.

Вне Telegram dev-сервер открывает экран входа через бота (FT-128), а для входа нужны настоящий бот и сеть Telegram. Чтобы сразу работать под тестовым пользователем, задайте в `webapp/.env.local` `VITE_MOCK_USER_ID=<telegram id>` (и, если нужно, `VITE_MOCK_USER_NAME`): запросы пойдут с заголовком `X-Dev-User-Id`, который backend принимает только вне production. Образец — в `webapp/.env.example`.

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
- Base image: `node:20-alpine` (multi-stage build: `builder` → `production`)
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
npm run test:webapp      # Webapp Vitest tests
npm run verify           # Full pre-commit gate (see below)
```

`npm run verify` runs, in order:

1. `npm run build` — backend TypeScript build
2. `npm run test:ci` — Jest serially (`jest --runInBand`)
3. `npm run test:webapp` — webapp Vitest tests
4. `npm run build:webapp` — webapp production build
5. `npm run analyze` — `dependency-cruiser` + `madge` circular scan

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
| `DATABASE_TYPE` | `sqlite` | только `sqlite`; любое другое значение — ошибка запуска |
| `FREE_LIMITS_ENABLED` | `false` | `true` включает лимиты бесплатного тарифа. На время вехи 10 выключены (решение Д3); использование всё равно считается |
| `TG_BOT_API_KEY` | - | Telegram bot token |
| `ALLOWED_TELEGRAM_IDS` | - | Закрытый доступ (FT-153): Telegram id через запятую. Остальным бот молчит (в логе `warn` с id), API отвечает `403 ACCESS_NOT_ALLOWED` до создания пользователя, итоги дня и напоминания им не уходят. Пусто — пускает всех, но при `NODE_ENV=production` пустой список — ошибка запуска; запись не из цифр — ошибка запуска всегда. Свой id виден в логе: с непустым списком бот пишет `warn` с id каждого, кого не пустил |
| `TG_BOT_USERNAME` | - | @username бота без `@` для ссылки входа в браузере `t.me/<bot>?start=login_…` (FT-128). Пусто — спрашивается у Telegram (`getMe`) |
| `WEB_APP_URL` | `http://localhost:3000` | Public URL (перезаписывается `npm run dev:miniapp`; у живого экземпляра — адрес tailnet, [live-instance.md](live-instance.md)) |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Модель разбора текста (`gpt-4-turbo` OpenAI снял) |
| `OPENAI_TIMEOUT_MS` | `20000` | Сколько ждать ответа OpenAI на разбор текста и расшифровку голоса (FT-145). Без него SDK ждёт 10 минут |
| `OPENAI_MAX_RETRIES` | `1` | Сколько раз повторить разбор текста после таймаута или сбоя, 0–5 (FT-145). Голос не повторяется |

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
- [Database Guide](database-guide.md) - SQLite, TypeORM и миграции
- [Troubleshooting](troubleshooting.md) - Решение проблем
- [Architecture Overview](../01-architecture/overview.md) - Понимание структуры

---

## Quick Reference

```bash
# Development
npm run dev:miniapp -- --chat-id=<id>   # Phone/Mini App: tunnel + WEB_APP_URL + menu + serve
npm run dev:full         # Full-stack с hot reload
npm run dev              # Backend only
npm test                 # Run tests
npm run verify           # Full gate before commit/push

# Production
npm run build            # Compile TypeScript
npm run serve            # Run compiled app
scripts/live-update.sh   # Live instance on the PC: pull main, build, restart (live-instance.md)

# Docker
docker compose up -d --build

# Database
sqlite3 data/database.sqlite
```

---

**Ready to develop!** 🚀

См. также: [PROJECT_DOCUMENTATION.md](../../../PROJECT_DOCUMENTATION.md) для детальной документации.
