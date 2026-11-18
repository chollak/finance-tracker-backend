# Quick Start Guide

Быстрый старт для запуска Finance Tracker Backend локально.

## Prerequisites

- **Node.js**: 22 (`.nvmrc`; `nvm use`). Сервер на `openai` 7 требует 22+ (FT-183); webapp на Vite 7 и Vitest 4 — 20.19+, на Node 16–18 `npm install` падает на сборке webapp
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
# Optional: admins of the subscription grant, whole Telegram ids, comma-separated; a wrong entry stops the start (#255)
ADMIN_TELEGRAM_IDS=
# Optional: the bot's @username for the web login link (FT-128); asked from Telegram when empty
TG_BOT_USERNAME=YourBot
WEB_APP_URL=http://localhost:3000
# Set false to run API without Telegram polling
ENABLE_TELEGRAM_POLLING=true

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
- `.env` is ignored and used as the default local env file.
- `.env.local` is ignored and preferred for machine-specific overrides.
- `.env.development` is ignored legacy/local naming; the app does not load it.
- Loading order: existing `process.env` values stay highest priority; then `.env.local` if present; otherwise `.env`.
  The file is loaded by `src/shared/infrastructure/config/loadEnvironment.ts` before the logger is created, so
  `LOG_LEVEL` and `NODE_ENV` from it set the log level and format too (FT-165; before that only the process
  environment did).
- Jest does not read the env file (#393): `tests/setup/env.ts` puts an empty module in place of `loadEnvironment.ts`,
  so `npm test` gives the same result with any `.env.local` and without one. A test that needs a variable sets it
  itself; what the shell exports still reaches the tests.

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

Kapelka для ежедневного пользования — systemd-сервис на ПК с WSL: копия `~/dev/projects/kapelka-live` на `main`,
`NODE_ENV=production`, постоянный адрес `https://<пк>.<tailnet>.ts.net` через `tailscale serve`, свой бот Kapelka,
кнопка меню ставится один раз. Установка, проверка, логи и откат — [live-instance.md](live-instance.md) (FT-156).
Обновление — одна команда в живой копии:

```bash
scripts/live-update.sh
```

До переезда (FT-159, закончен 2026-10-29) живой экземпляр работал на маке через `npm run dev:miniapp`; теперь мак —
только разработка.

### Phone / Telegram Mini App во время разработки

Для проверки ветки на телефоне с мака: временный адрес Cloudflare quick tunnel. После переезда (FT-159) — с
@FinanceTrackerDevBot, ботом для разработки: у живого экземпляра на ПК свой бот Kapelka, а один токен опрашивает
только один процесс.

```bash
# Подставьте свой Telegram chat/user id.
npm run dev:miniapp -- --chat-id=<telegram_chat_id>
```

Что делает команда (`scripts/dev-miniapp.js`):

1. Поднимает Cloudflare quick tunnel и получает публичный HTTPS-адрес. `cloudflared` ищет в `CLOUDFLARED_BIN`,
   `~/.local/bin` (WSL) и в `PATH` (Homebrew на macOS). Адрес берётся только из рамки
   `Your quick Tunnel has been created!`, которую печатает `cloudflared`. Если туннель не поднялся (нет сети,
   `cloudflared` завершился или не назвал адрес за 45 с), скрипт останавливается с
   `cloudflared did not open a quick tunnel …` и не трогает ни env-файл, ни menu-кнопку (FT-170).
2. Записывает этот адрес как `WEB_APP_URL` в тот env-файл, который читает приложение: `.env.local`, если он есть,
   иначе `.env` (`--env-file` меняет выбор).
3. Обновляет постоянную menu-кнопку бота в Telegram через `setChatMenuButton`.
4. Собирает проект и запускает `npm run serve`.
5. Следит за туннелем. Временный туннель не переживает сон компьютера: Cloudflare его удаляет, и `cloudflared` пишет
   `Unauthorized: Tunnel not found`. Тогда (и если `cloudflared` завершился) скрипт поднимает новый туннель, пишет адрес
   в env-файл, обновляет menu-кнопку и перезапускает сервер, который запустил сам: сервер читает `WEB_APP_URL` при
   старте для ссылок бота. Без сети пробует снова через 30 с, 1, 2, 4 и 5 минут; пока новый туннель не поднялся,
   env-файл и menu-кнопка остаются прежними. Пока компьютер спит, не работает
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
- Кнопки-ссылки в боте («Открыть Kapelka ↗», «Открыть в Kapelka ↗», «Вернуться в браузер ↗») появляются только с HTTPS-адресом в `WEB_APP_URL` (`npm run dev:miniapp`); с `http://localhost:3000` бот отвечает без них (#278).
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
  -H "X-Dev-User-Id: 900000001" \
  -d '{
    "amountMinor": 2500000,
    "type": "expense",
    "category": "Кафе",
    "description": "кофе"
  }'
```

> **Note:** без входа маршрут отвечает `401`; вне production с этой машины входит заголовок `X-Dev-User-Id` с
> Telegram id (`900000001` — пользователь `npm run seed:test`; при непустом `ALLOWED_TELEGRAM_IDS` id должен быть в
> списке). Запись — того, кто вошёл: `userId` в теле не нужен.
> Сумма — `amountMinor` в минорных единицах (25 000 сум — `2500000`) или старое `amount` в сумах. `category` — название
> категории пользователя (`GET /api/categories`) или `categoryId`; незнакомое уходит в «Другое». `date` — по желанию,
> по умолчанию сегодня. Контракт — [`docs/pastel/api.md`](../../pastel/api.md).

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

## Docker

Docker-образа нет: `Dockerfile` и `docker-compose.yml` удалены в #325. Разработка — команды `npm run dev*` выше, живой экземпляр — служба systemd в WSL ([live-instance.md](live-instance.md)).

---

## Development Tools

### Testing

```bash
npm test                  # Run all tests (Jest does not check types)
npm run test:ci           # Run tests serially for CI/Hermes verification
npm run typecheck:tests   # Types of tests/ and src/, one tsc (tsconfig.test.json)
npm run typecheck:scripts # Types of the TypeScript scripts in scripts/ (tsconfig.scripts.json)
npm test -- --watch      # Watch mode
npm test -- --verbose    # Detailed output
npm test transaction     # Run specific test file
```

Jest does not check types: ts-jest only translates each file (#293). A type error in a test fails
`npm run typecheck:tests` (a step of `verify`), not `npm test`.

Bot scenarios run on `tests/helpers/telegramStand.ts` (#280, #294): the real `startTelegramBot` on the real Telegraf,
so Telegraf routes the commands, presses and the order `telegramBot.ts` registers the handlers in; only the Bot API is
a fake — Telegram's private chats with the bot. A chat is its person's Telegram id, so a `chat_id` sent as a string (the
notices do) is the same chat; a chat Telegram does not have with the bot — not the person's, not of someone whose update
came, not named with `chatWith()` — is refused «chat not found», and a message is edited only in its own chat. It
refuses as Telegram does (an edit of a deleted message, an edit that changes nothing, a second answer to a press, a
Mini App button off HTTPS) and on demand (`refuse()` / `stopRefusing()` — 429, a network error; `block()` /
`unblock()` — 403; `hang()` — a process killed while it waits for Telegram, until the next `start()`). Updates come one
at a time or as one getUpdates batch (`deliver([...])`, handed over side by side as polling does; the bot's chat queue
then takes one chat's updates in order, #317), from the person or `from` someone else, with `sentAt` as Telegram's
`message.date`. An update that ends in `bot.catch` fails the delivery unless the test passes `botCatch: 'allow'`.
`start(modules, { botId })` is a restart, as another bot if asked; the notices' schedulers send through
`stand.telegram`, and `stand.sent()` is every message Telegram took, as sent. The bot's scenarios use it. Three suites
fake Telegram otherwise, for what the stand does not do: `telegramBot.test.ts` (`jest.doMock('telegraf')` — the launch,
409 polling conflicts, the stop), `telegramBotGracefulStop.test.ts` (the Bot API under Telegraf's own polling loop) and
`premiumWithoutDebts.test.ts` (an object that keeps what `registerPaymentHandlers` registers).

A suite whose bot restarts opens the same file again: a `DatabaseFile` from `tests/helpers/testDatabase.ts`
(`prepareDatabaseOnce().newFile()` — the file migrated once per suite — or `newDatabaseFile()`); each `open()` is a new
connection made as the app makes one, `remove()` closes them and deletes the folder.

`tests/appModules.test.ts` runs the app as `src/index.ts` assembles it (#294): `createModules()` on `AppDataSource`
pointed at a temp file (`setOptions` before it connects, checked before anything is migrated; the project's
`data/database.sqlite` is never opened), `buildServer` and `createHttpApp`, the bot from the same modules. Each of the
ten `set…` links of `createModules()` fails a test there when it is left out — a new link gets its check there too;
the other suites wire the modules they need by hand.

### Code Quality

```bash
npm run format           # Format code with Prettier
npm run check:deps       # Dependency rules, circular imports included (no-circular)
npm run analyze          # The architecture step of verify: check:deps
npm run test:webapp      # Webapp Vitest tests
npm run lint:webapp      # Webapp ESLint, warnings fail it too
npm run verify           # Full pre-commit gate (see below)
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
| `TG_BOT_API_KEY` | - | Telegram bot token; required in production while polling is on (FT-167) |
| `ALLOWED_TELEGRAM_IDS` | - | Закрытый доступ (FT-153): Telegram id через запятую. Остальным бот молчит (в логе `warn` с id), API отвечает `403 ACCESS_NOT_ALLOWED` до создания пользователя, итоги дня и напоминания им не уходят. Пусто — пускает всех, но при `NODE_ENV=production` пустой список — ошибка запуска; запись не из цифр — ошибка запуска всегда. Свой id виден в логе: с непустым списком бот пишет `warn` с id каждого, кого не пустил — первый отказ сразу, повторы того же id одной строкой `(repeats)` с числом пропущенных раз в 10 минут (FT-166) |
| `ADMIN_TELEGRAM_IDS` | - | Админы `requireAdmin` (выдача подписки `POST /api/subscription/grant`): целые Telegram id через запятую, по правилу `ALLOWED_TELEGRAM_IDS` — ведущие нули тот же id. Пусто — админов нет; запись не из цифр — ошибка запуска всегда (#255) |
| `TG_BOT_USERNAME` | - | @username бота без `@` для ссылки входа в браузере `t.me/<bot>?start=login_…` (FT-128). Пусто — спрашивается у Telegram (`getMe`) |
| `WEB_APP_URL` | `http://localhost:3000` | Public URL (перезаписывается `npm run dev:miniapp`; у живого экземпляра — адрес tailnet, [live-instance.md](live-instance.md)) |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Модель разбора текста (`gpt-4-turbo` OpenAI снял) |
| `OPENAI_ORG_ID` | - | Приложение её не читает (с FT-174), но SDK `openai` сам подхватывает её из окружения, если она задана, — с неверным значением запросы, и расшифровка голоса тоже, падают `401`. На живом экземпляре не задавать |
| `OPENAI_TIMEOUT_MS` | `20000` | Сколько ждать ответа OpenAI на разбор текста и расшифровку голоса (FT-145). Без него SDK ждёт 10 минут |
| `OPENAI_MAX_RETRIES` | `1` | Сколько раз повторить разбор текста после таймаута или сбоя, 0–5 (FT-145). Голос не повторяется |
| `SHORTCUT_CAPTURE_TOKEN` | - | Токен Shortcut с iPhone для `POST /api/quick-capture`, заголовок `X-Shortcut-Capture-Token` (FT-075, FT-155). При `NODE_ENV=production` — не короче 32 символов и только вместе с `SHORTCUT_CAPTURE_OWNER`, иначе ошибка запуска; оба пустые — Shortcut выключен. Отзыв — новое значение и перезапуск. [QUICK_CAPTURE_API.md](../../QUICK_CAPTURE_API.md#ios-shortcut-capture) |
| `SHORTCUT_CAPTURE_OWNER` | - | Telegram id, на которого пишутся все записи по токену; должен быть в `ALLOWED_TELEGRAM_IDS`. Вне production без него владельца называет заголовок `X-Shortcut-User-Id` |

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

# Database
sqlite3 data/database.sqlite
```

---

**Ready to develop!** 🚀

См. также: [PROJECT_DOCUMENTATION.md](../../../PROJECT_DOCUMENTATION.md) для детальной документации.
