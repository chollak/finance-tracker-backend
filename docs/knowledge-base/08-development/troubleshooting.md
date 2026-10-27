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
| Subscription UUID error | Resolve telegram_id → UUID in controller |

---

## Live Instance on the PC

Живой экземпляр на ПК с WSL, его установка, обновление и откат — [live-instance.md](live-instance.md). Команды ниже —
в WSL, в копии `~/daftar-live`.

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
systemctl status daftar.service --no-pager
journalctl -u daftar.service -n 100 --no-pager
```

| В журнале | Причина |
|---|---|
| `ALLOWED_TELEGRAM_IDS is required in production` | Пустой список доступа в `.env.local` (FT-153) |
| `409` / `Conflict` | Тот же токен опрашивает другой процесс — живой экземпляр на маке |
| `401` / `Unauthorized` | Неверный `TG_BOT_API_KEY` |
| `NODE_MODULE_VERSION` | `node_modules` собраны под другой Node: `scripts/nvm-exec.sh npm ci --include=dev` |
| `start request repeated too quickly` | Сработал лимит стартов. Исправить причину, затем `sudo systemctl reset-failed daftar.service && sudo systemctl start daftar.service` |

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
