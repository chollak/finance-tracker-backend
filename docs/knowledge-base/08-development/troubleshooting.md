# Troubleshooting

Решения частых проблем при разработке.

## Environment & Setup

### Environment Variables Missing

**Error:**
```
Configuration validation failed: Missing OPENAI_API_KEY
```

**Solution:**
1. Check `.env` file exists в корне проекта
2. Verify `OPENAI_API_KEY` is set
3. No spaces around `=`: `KEY=value` (not `KEY = value`)
4. Restart server after changes

---

### Port Already in Use

**Error:**
```
EADDRINUSE: address already in use :::3000
```

**Solution:**
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

---

## Database Issues

### SQLite: Database File Not Found

**Error:**
```
SQLITE_CANTOPEN: unable to open database file
```

**Solution:**
```bash
# Create data directory
mkdir -p data
chmod 755 data

# Database will be created automatically on first run
npm run dev
```

---

### SQLite: Database Locked

**Error:**
```
SQLITE_BUSY: database is locked
```

**Solution:**
- Only one process can write at a time
- Ensure no other instances running:
```bash
pkill -f "ts-node-dev"
pkill -f "node.*index"
```

---

### Database: schema differs from entities / cannot adopt baseline

**Error / log:**
```
Database schema differs from entities — add a migration
The database does not match the baseline schema, so it cannot be adopted automatically
```

**Solution:** схема меняется только миграциями (FT-090). Добавить миграцию для изменённой сущности или
недостающие колонки — см. [Database Guide](database-guide.md). Копия базы перед миграциями лежит в
`data/backups/`. Supabase как отдельный путь к базе убран; ошибки `supabase.co` больше не относятся к
приложению.

---

## OpenAI API Issues

### Invalid API Key

**Error:**
```
Error: Invalid API key provided
```

**Solution:**
1. Get valid key from [platform.openai.com](https://platform.openai.com/)
2. Update `.env`:
```bash
OPENAI_API_KEY=sk-...
```
3. Restart server

---

### Rate Limit Exceeded

**Error:**
```
Error: Rate limit reached for requests
```

**Solution:**
- Wait and retry
- Check usage в OpenAI dashboard
- Add credits to account
- Implement retry logic with exponential backoff

---

### No Credits / Billing Required

**Error:**
```
Error: You exceeded your current quota
```

**Solution:**
1. Go to [platform.openai.com/account/billing](https://platform.openai.com/account/billing)
2. Add payment method
3. Add credits

---

## Module & Import Errors

### Cannot Resolve Module

**Error:**
```
Error: Cannot find module '../domain/transactionRepository'
```

**Solution:**
1. Check file path is correct
2. Verify file exists
3. Check TypeScript compilation:
```bash
npm run build
```
4. Clear cache:
```bash
rm -rf dist/
npm run build
```

---

### Circular Dependency Detected

**Error:**
```
Warning: Circular dependency detected
```

**Solution:**
1. Find circular deps:
```bash
npm run check:circular
```
2. Refactor to break cycle:
   - Move shared code to separate file
   - Use dependency injection
   - Avoid importing modules that import you back

---

## Frontend Issues

### Frontend Not Loading

**Problem:** Opening http://localhost:3000 shows blank page

**Solution:**
```bash
# Rebuild frontend
npm run build:webapp

# Restart server
npm run dev
```

---

### API Calls Failing (CORS)

**Error in browser console:**
```
Access to fetch blocked by CORS policy
```

**Solution:**
- CORS is configured to allow all origins
- Check middleware order в `expressServer.ts`
- Ensure CORS middleware comes before routes

---

## Voice Processing Issues

### FFmpeg Not Found

**Error:**
```
FFmpeg not found, using fallback
```

**Solution:**
```bash
# macOS
brew install ffmpeg

# Ubuntu
sudo apt-get install ffmpeg

# Fallback works, but FFmpeg is better
```

---

### Voice Transcription Failed

**Error:**
```
Error: No speech detected
```

**Solution:**
- Check audio file is valid
- Ensure audio has speech (not just noise)
- Verify OpenAI API key has Whisper access
- Try shorter audio file (< 25MB)

---

## Subscription API Issues

### Invalid UUID Error

**Error:**
```
Failed to create usage limit: invalid input syntax for type uuid: "131184740"
```

**Cause:**
API получает telegram_id (числовой) или guest_id вместо UUID. Это происходит когда:
- Webapp передает telegram_id напрямую
- Guest user (без Telegram аутентификации) делает запрос

**Solution:**
Controller должен резолвить telegram_id → UUID через UserModule:

```typescript
// В SubscriptionController
if (this.isGuestUser(userId)) {
  return this.createGuestUserResponse(userId); // Free tier без БД
}
const userUUID = await this.resolveUserId(userId); // telegram_id → UUID
```

**Files:**
- `src/modules/subscription/presentation/subscriptionController.ts`
- `src/delivery/web/express/routes/subscriptionRoutes.ts`

**После исправления:** Rebuild Docker container:
```bash
docker compose down
docker compose up -d --build
```

---

## Telegram Bot Issues

### Bot Not Responding

**Problem:** Bot doesn't respond to messages

**Solution:**
1. Check `TG_BOT_API_KEY` в `.env`
2. Verify bot token is valid (check with BotFather)
3. Check server logs for errors
4. Restart server:
```bash
npm run dev
```

---

### Bot Commands Not Working

**Problem:** `/start` command does nothing

**Solution:**
- Check bot handlers в `telegramBot.ts`
- Verify no errors в server logs
- Test with simple text message first

---

## Performance Issues

### Slow API Responses

**Problem:** Requests taking > 5 seconds

**Solution:**
1. Check logs for slow request warnings
2. Add database indexes:
```sql
CREATE INDEX idx_transactions_user_date
ON transactions(user_id, date DESC);
```
3. Optimize queries
4. Check OpenAI API response time

---

### High Memory Usage

**Problem:** Node process using too much memory

**Solution:**
1. Check for memory leaks:
```bash
node --inspect dist/index.js
```
2. Monitor with:
```bash
ps aux | grep node
```
3. Restart process periodically в production

---

## Testing Issues

### Tests Failing

**Error:**
```
FAIL tests/transaction.test.ts
```

**Solution:**
1. Run individual test:
```bash
npm test transaction
```
2. Check test database setup
3. Verify mocks are correct
4. Clear test artifacts:
```bash
rm -rf coverage/
npm test
```

### HTTP Test Gets 404 or `fetch failed` Only in a Full Run (FT-151)

**Error:** a test that passes alone fails now and then in `npm run test:ci`: `Expected: 201, Received: 404`, or
`TypeError: fetch failed` with `read ECONNRESET` / «other side closed».

**Cause:** the test server listened on port 0 of every interface (`app.listen(0)` binds `[::]`) and the test called
`http://127.0.0.1:<port>`. On macOS the kernel hands out ports one after another and, for `[::]`, does not look at IPv4
listeners, so the server can get a port another program already holds on `127.0.0.1` (VS Code, Notion, GitKraken,
OrbStack…). The request then goes to that program.

**Solution:** start test servers with `listenOnLoopback(app)` or `startTestServer(routes)` from
`tests/helpers/testServer.ts`. They bind `127.0.0.1`, where the kernel skips taken ports, and start the shared rate
limiters with empty counters. `tests/testServer.test.ts` fails on any `listen` call in `tests/` that does not name
`'127.0.0.1'` itself.

### `npm run verify` Runs Out of Memory in the Main Folder

**Error:** `FATAL ERROR: … JavaScript heap out of memory` during `test:ci`, or `jest-haste-map: Haste module naming
collision: finance-tracker-backend`; Jest reports far more than 93 suites.

**Cause:** agent copies of the repo live in `.claude/worktrees/` inside it, and `testMatch` took their tests and
`package.json` too. **Solution:** `jest.config.js` ignores `<rootDir>/.claude/` and `<rootDir>/dist/`
(`testPathIgnorePatterns`, `modulePathIgnorePatterns`). Check with `npx jest --listTests | grep -c test.ts`.

---

## Logs & Debugging

### Enable Debug Logging

```bash
DEBUG=* npm run dev
```

### View Request Logs

All requests are logged automatically:
```
GET /api/transactions 200 45ms
POST /api/transactions 201 123ms
```

### Check Health Endpoint

```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-09T...",
  "uptime": 123.45,
  "telegramBot": { "state": "running", "attempts": 1 }
}
```

`503` with `"status": "unhealthy"` means the bot's polling failed for good (`telegramBot.state = failed`, the cause in
`telegramBot.lastError`); `starting`, `retrying`, `running` and `disabled` are `200` (FT-154).

### Production process exits right after start

With `NODE_ENV=production` a bot that failed for good shuts the process down with exit code `1`, so systemd restarts
it (FT-154, `docs/knowledge-base/01-architecture/runtime-process-mode.md`). Look for the reason in the journal:

```bash
journalctl -u <service> -n 50 | grep -E "Telegram bot polling failed permanently|down for good|Shutting down"
```

- `401: Unauthorized` / `404: Not Found` — `TG_BOT_API_KEY` is wrong or revoked: fix it in `.env.local`.
- `409: Conflict` — another process polls the same token (the Mac's `npm run dev:miniapp`, a second service): stop it.
  The process retries a `409` with backoff first (`TELEGRAM_POLLING_MAX_RETRIES`, default 5) and exits only after that.
  A launch that has polled for 80 s (`POLLING_STABLE_MS` with the defaults) starts the count anew (FT-167), so a `409`
  long after the start is retried too.
- `Configuration validation failed` with `TG_BOT_API_KEY is required in production` — polling is on and the token is
  empty (FT-167). Put the token in `.env.local`, or set `ENABLE_TELEGRAM_POLLING=false` to run without the bot.

### A restart while the bot is handling a message

On `SIGTERM` the bot stops taking updates and finishes the one it is handling — up to 5 s — before the database closes
(FT-167). The journal shows `Stopping Telegram bot`, then `Telegram bot stopped`. With
`Telegram bot did not stop in time; Telegram sends the updates it did not confirm again after the restart` the handler
(or a launch still waiting for Telegram) did not finish in time: Telegram sends that message again after the start, and
`Telegram sent a handled message again; its records are not written twice` says the bot found its records by the
message's client id instead of writing them again (`… an amount answer again; it is not applied twice` — the same for
an answer to «Сумму»). If the person got no confirmation the first time, the bot sends it then.

### Who was turned away by `ALLOWED_TELEGRAM_IDS`

With a list set, the bot ignores everyone else and the API answers them `403 ACCESS_NOT_ALLOWED` (FT-153). The log
names each refused Telegram id once, at its first refusal: `Telegram update from a user who is not allowed ignored`
(bot) or `Request from a Telegram user who is not allowed refused` (API), with `telegramId`. That is also how to find
your own id. Repeats of the same id within 10 minutes are not written one by one (FT-166): when the 10 minutes are
over, one line with `(repeats)` says how many were skipped (`skipped`, `windowMinutes`). Someone who keeps writing
costs one line per 10 minutes, not one per message.

```bash
journalctl -u <service> --grep "not allowed" --no-pager | tail -n 20
```

- No `(repeats)` line — the id was refused once in those 10 minutes.
- The counts live in the process: a restart forgets them, and refusals not yet summarised at the restart are not
  written. After it, the first refusal of an id is written at once again.
- The process remembers up to 1000 refused ids. Past that, the id refused longest ago is forgotten — its `(repeats)`
  line goes out first — and is written again as new when it comes back.

---

## Common Solutions Summary

| Problem | Quick Fix |
|---------|-----------|
| Port in use | `lsof -i :3000`, `kill -9 <PID>` |
| Env vars missing | Check `.env` file, restart server |
| Database locked | Kill other processes |
| OpenAI errors | Verify API key, check credits |
| Frontend broken | `npm run build:webapp` |
| Bot not working | Check token, restart server |
| Slow requests | Add indexes, optimize queries |
| Live instance: `git pull` fails | HTTPS remote — [Live Instance on the PC](#live-instance-on-the-pc) |
| Live instance: no fresh backups | `journalctl -u kapelka-backup.service` — [Backup Fails](#backup-fails) |
| Subscription UUID error | Resolve telegram_id → UUID in controller |

---

## Live Instance on the PC

Живой экземпляр на ПК с WSL, его установка, обновление и откат — [live-instance.md](live-instance.md). Команды ниже —
в WSL, в копии `~/kapelka-live`.

### `live-update.sh` Refuses to Run

| Сообщение | Что значит и что делать |
|---|---|
| `the live copy is on '…', not main` | Копия на откате или на другой ветке. Когда исправление в `main`: `git switch main`, затем `scripts/live-update.sh` |
| `the working tree has changes` | В живой копии правили файлы. `git status`, `git diff` — нужное перенести в репозиторий через PR, потом `git restore .`; лишние файлы — сначала `git clean -n` (список), затем `git clean -f`. `data/` и `.env.local` в git не входят, их это не трогает |
| `.env.local is missing` | Шаг 5 в [live-instance.md](live-instance.md) |
| `commit(s) that are not in origin/main` | В живой копии сделали коммит: `git log --oneline origin/main..HEAD`. Нужное перенести через PR, затем `git reset --hard origin/main` |

### Git Pull Fails on the PC

**`Permission denied (publickey)`** — копию склонировали по SSH, а ключа на ПК нет. Репозиторий публичный, живой копии
пушить нечего — переключить на HTTPS:

```bash
git remote set-url origin https://github.com/chollak/finance-tracker-backend.git
git pull --ff-only origin main
```

**`Not possible to fast-forward`** — в живой копии есть свои коммиты: `git log --oneline origin/main..main`. Нужное
перенести через PR, затем `git fetch origin && git reset --hard origin/main`.

**`Could not resolve host`** — у WSL нет сети или DNS: `curl -sI https://github.com`, `cat /etc/resolv.conf`.

### Service Restarts in a Loop or Is `failed`

```bash
systemctl status kapelka.service --no-pager
journalctl -u kapelka.service -n 100 --no-pager   # без группы adm — через sudo
```

Выход из-за бота (`401`, `409`) — раздел [Production process exits right after start](#production-process-exits-right-after-start).

| В журнале | Причина |
|---|---|
| `Configuration validation failed` | Настройка в `.env.local` не проходит проверку на старте; список ошибок — в той же записи (`errors`). Например, `ALLOWED_TELEGRAM_IDS is required in production` (FT-153) или Shortcut задан наполовину, токен короче 32 символов, владелец не в `ALLOWED_TELEGRAM_IDS` (FT-155) |
| `Telegram bot polling failed permanently` сразу после старта, без `409` | Нет сети на старте: в production процесс выходит (FT-154), systemd запускает его снова с растущей паузой |
| `NODE_MODULE_VERSION` | `node_modules` собраны под другой Node: `scripts/nvm-exec.sh npm ci --include=dev` |
| `start request repeated too quickly` | Сработал лимит стартов (на systemd 249 / Ubuntu 22.04 — после ~20 быстрых перезапусков, например при долгом отсутствии сети). Исправить причину, затем `sudo systemctl reset-failed kapelka.service && sudo systemctl start kapelka.service` |

### Backup Fails

Ночной бэкап (FT-157) — раздел «Бэкап» в [live-instance.md](live-instance.md#бэкап-ft-157). Последний запуск и его
причина:

```bash
systemctl list-timers kapelka-backup.timer
journalctl -u kapelka-backup.service -n 20 --no-pager
```

После исправления — `sudo systemctl start kapelka-backup.service`: копия сразу, не дожидаясь ночи.

| В журнале | Что значит и что делать |
|---|---|
| `BACKUP_DIR is not set` | Нет строки `BACKUP_DIR=/mnt/c/KapelkaBackup` в `~/kapelka-live/.env.local` или она пустая — дописать |
| `does not exist or is not a folder` | Папки нет: создать `C:\KapelkaBackup` в Windows. Если `ls /mnt/c` пуст, WSL не смонтировал диск C: — PowerShell `wsl --shutdown`, затем `Start-ScheduledTask -TaskName 'Kapelka WSL'`. Скрипт папку не создаёт намеренно: иначе она оказалась бы внутри WSL |
| `is on the same disk as …/data` | `BACKUP_DIR` указывает внутрь WSL (`~/…`, `/home/…`) — копия умерла бы вместе с базой. Указать папку на C: (`/mnt/c/…`) |
| `is not writable` | Папку создали от другого пользователя Windows или только для чтения: свойства папки → Безопасность |
| `sqlite3 is not installed` | `sudo apt-get install -y sqlite3` |
| `another backup is running` | Второй запуск, пока идёт первый (ручной и по таймеру). Ничего не записано; через минуту `sudo systemctl start kapelka-backup.service`. Если первого нет (`pgrep -fl backup-db.sh` пуст), а сообщение повторяется — `fuser -v ~/kapelka-live/data/backups/.backup-db.lock` |
| `WARNING: this copy has N records, the previous one … has M` | Запуск прошёл, но в новой копии меньше половины записей предыдущей. Если базу потеряли (переустановка WSL) — `sudo systemctl stop kapelka-backup.timer` и «Восстановление» в [live-instance.md](live-instance.md#восстановление) из копии до потери; если записи удалили намеренно — ничего |
| `WARNING: the clock is behind the newest copy` | Часы WSL отстали: `date`, в PowerShell `wsl --shutdown` и снова `Start-ScheduledTask -TaskName 'Kapelka WSL'`. Копия этого запуска сохранена, но по имени выглядит старше |
| `fails PRAGMA integrity_check` | Копия не прошла проверку — скорее всего, повреждена живая база: `sqlite3 -readonly data/database.sqlite 'PRAGMA integrity_check;'`. В облачную папку ничего не записано, прошлые копии целы. Если и живая не `ok` — восстановление из последней хорошей копии (раздел «Восстановление») |
| `cannot rename` или `cannot delete the old copy` | Windows держит файл (антивирус, Google Drive). Скрипт повторяет переименование три раза; если копия этого запуска не встала на место, следующий запуск снимет новую. Повторяется каждую ночь — посмотреть, кто держит файл |
| `never read as whole JSON` | База скопирована, а `data/patterns.json` или `data/learning-data.json` не читается как JSON. Приложение тогда само берёт `data/*.seed.json`; испорченный файл можно убрать в `data/backups/` |
| `kapelka-backup.timer` не загружается: `Failed to parse calendar specification` | Нет часовых поясов: `sudo apt-get install -y tzdata`, затем `sudo systemctl daemon-reload` |
| Копии на C: свежие, в Google Drive — старые | Drive for desktop не запущен (в Windows никто не входил) или на паузе. Войти в Windows, проверить значок Drive в трее |

---

## Deployment Issues

### Docker Build Fails

**Error:**
```
Error response from daemon: No such image
```

**Solution:**
```bash
# Clean up Docker
docker compose down
docker system prune -a

# Rebuild
docker compose up -d --build

# Check status
docker compose ps
docker compose logs -f
```

---

## Getting Help

### Check Logs First

```bash
# View full logs
npm run dev

# Docker logs
docker compose logs -f
```

### Verify Setup

```bash
# Test environment
node -e "console.log(process.env.OPENAI_API_KEY)"

# Test database
sqlite3 data/database.sqlite ".tables"

# Test OpenAI
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### Documentation

- [Quick Start](quick-start.md) - Setup guide
- [Database Guide](database-guide.md) - Database issues
- [`PROJECT_DOCUMENTATION.md`](../../../PROJECT_DOCUMENTATION.md) - Full docs

---

**Не нашли решение?** Проверьте логи, environment variables, и перезапустите сервер - это решает 90% проблем!
