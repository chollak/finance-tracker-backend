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

### Supabase: Connection Failed

**Error:**
```
Error: fetch failed to https://xxx.supabase.co
```

**Solution:**
1. Check `SUPABASE_URL` and `SUPABASE_ANON_KEY` в `.env`
2. Verify project is active в Supabase dashboard
3. Check internet connection
4. Test connection:
```bash
npm run supabase:test
```

---

### Supabase: Table Not Found

**Error:**
```
error: relation "transactions" does not exist
```

**Solution:**
Run migrations в Supabase SQL Editor:
```bash
# See migrations/001_initial_schema.sql
```

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
  "uptime": 123.45
}
```

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
| SSH auth failed | Update `SSH_HOST` with new IP, configure Elastic IP |
| Git pull fails | Switch to HTTPS or regenerate SSH keys |
| Subscription UUID error | Resolve telegram_id → UUID in controller |

---

## Deployment Issues

### SSH Authentication Failed (GitHub Actions)

**Error:**
```
ssh: handshake failed: ssh: unable to authenticate, attempted methods [none publickey], no supported methods remain
```

**Common Causes:**

1. **IP Address Changed (AWS EC2)**
   - After server restart, AWS assigns new IP
   - GitHub Actions tries to connect to old IP from `SSH_HOST` secret

2. **SSH Key Mismatch**
   - `SSH_KEY` в GitHub Secrets doesn't match server's `authorized_keys`

**Solutions:**

#### 1. Update SSH_HOST with New IP

**On server:**
```bash
# Get current public IP
curl -s http://checkip.amazonaws.com
```

**On GitHub:**
1. Go to: https://github.com/YOUR_REPO/settings/secrets/actions
2. Edit `SSH_HOST` secret
3. Update with new IP address
4. Save and re-run deployment

#### 2. Configure AWS Elastic IP (Recommended)

To prevent IP changes on restart:

**In AWS Console:**
1. EC2 Dashboard → Network & Security → Elastic IPs
2. Click "Allocate Elastic IP address" → Allocate
3. Select new Elastic IP → Actions → Associate Elastic IP address
4. Choose your EC2 instance → Associate

**Update GitHub Secret:**
- Use Elastic IP in `SSH_HOST`
- IP won't change on restart anymore

**Cost:** Elastic IP is free while attached to running instance

#### 3. Verify SSH Configuration

**On server:**
```bash
# Check SSH keys exist
ls -la ~/.ssh/

# Test GitHub authentication
ssh -T git@github.com
# Should show: "Hi username! You've successfully authenticated..."

# Verify git remote
cd ~/finance-tracker-backend
git remote -v
```

**In GitHub:**
- Check `SSH_USER` matches server username
- Verify `SSH_KEY` contains correct private key
- Ensure no extra spaces/newlines in secrets

---

### Git Pull Fails on Server

**Error:**
```
git@github.com: Permission denied (publickey)
```

**Solution:**

**Option A: Switch to HTTPS (Simpler)**
```bash
cd ~/finance-tracker-backend
git remote set-url origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git pull origin main  # Test
```

**Option B: Fix SSH Keys**
```bash
# Generate new SSH key
ssh-keygen -t ed25519 -C "deploy@server" -f ~/.ssh/github_deploy

# Add to SSH config
cat >> ~/.ssh/config << 'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF

# Add public key to GitHub
cat ~/.ssh/github_deploy.pub
# Copy output, add to: https://github.com/settings/keys
```

---

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
