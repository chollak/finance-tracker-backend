# Server Deployment Instructions

## 📋 Overview
Instructions to deploy the updated finance tracker backend with direct telegramId usage on your server.

## 🚀 Deployment Steps

### 1. **Pull Latest Changes**
```bash
cd /path/to/your/finance-tracker-backend
git pull origin main
```

### 2. **Install/Update Dependencies**
```bash
npm install
```

### 3. **Stop Current Services** (if running)
```bash
# If using PM2
pm2 stop all

# If using Docker
docker compose down

# If running directly
pkill -f "node.*finance"
```

### 4. **Clean Database** 
```bash
# Remove existing database to force fresh migration
rm -f data/database.sqlite
rm -f data/database.sqlite-journal

# Ensure data directory exists
mkdir -p data
```

### 5. **Verify Environment Variables**
Make sure your `.env` file contains all required variables:
```bash
# Check required variables are set
grep -E "(NOTION_API_KEY|NOTION_DATABASE_ID|OPENAI_API_KEY|TG_BOT_API_KEY)" .env
```

Required variables:
- `NOTION_API_KEY` - Your Notion integration API key
- `NOTION_DATABASE_ID` - Your Notion database ID
- `OPENAI_API_KEY` - For voice transcription
- `TG_BOT_API_KEY` - Telegram bot token
- `WEB_APP_URL` - Public URL for web application

### 6. **Build Application**
```bash
npm run build
```

### 7. **Run Fresh Migration from Notion**
```bash
# This will create new database with telegramId schema and import all data
npx ts-node src/scripts/migrate-from-notion.ts
```

Expected output:
```
✅ Database connected
🔄 Starting Notion to SQLite migration...
📥 Exported X transactions from Notion
👥 Created X users
📁 Created X categories  
🏦 Created X accounts
💰 Imported X transactions
✅ Migration completed successfully!
```

### 8. **Verify Database**
```bash
# Check database was created and has data
sqlite3 data/database.sqlite "SELECT COUNT(*) as transactions FROM transactions;"
sqlite3 data/database.sqlite "SELECT telegramId, firstName FROM users;"
```

### 9. **Start Services**

**Option A: Using PM2 (Recommended)**
```bash
# Install PM2 globally if not installed
npm install -g pm2

# Start the application
pm2 start dist/index.js --name "finance-tracker"

# Save PM2 configuration
pm2 save
pm2 startup
```

**Option B: Using Docker**
```bash
docker compose up -d --build
```

**Option C: Direct Node.js**
```bash
# Production mode
npm run serve

# Or development mode (if needed)
npm run dev
```

### 10. **Verify Deployment**
```bash
# Test API endpoints
curl http://localhost:3000/api/transactions
curl http://localhost:3000/api/budgets/131184740

# Check application logs
pm2 logs finance-tracker  # for PM2
docker compose logs -f    # for Docker
```

## 🔧 Key Changes in This Update

### ✅ New Features
- **Direct TelegramId Usage**: API routes now use telegramId directly (e.g., `/api/budgets/131184740`)
- **Simplified Architecture**: Removed UUID conversion complexity
- **Better Performance**: No more ID lookup conversions

### 🗄️ Database Schema Updates
- Users table now uses `telegramId` as primary key
- All foreign keys reference `telegramId` instead of UUID
- Maintains full data integrity and relationships

### 📡 API Changes
Budget endpoints now work directly with telegramId:
- `GET /api/budgets/131184740` - Get user budgets
- `POST /api/budgets/131184740` - Create budget
- `GET /api/budgets/131184740/alerts` - Get budget alerts

## 🚨 Troubleshooting

### Migration Issues
```bash
# If migration fails, check:
1. Notion API key and database ID are correct
2. Notion database has proper schema
3. Network connectivity to Notion API

# Check logs for specific errors
tail -f logs/error.log
```

### Database Issues
```bash
# If database creation fails:
rm -rf data/
mkdir data/
npx ts-node src/scripts/migrate-from-notion.ts
```

### Service Issues
```bash
# Check if ports are available
netstat -tlnp | grep :3000

# Check application logs
pm2 logs finance-tracker
```

## 📊 Post-Deployment Verification

1. **API Health**: `curl http://localhost:3000/api/transactions`
2. **Database**: Should contain all your Notion transactions
3. **Telegram Bot**: Should work with new budget creation
4. **Web App**: Should display transactions correctly

## 🤖 Automated Deployment (GitHub Actions)

The project includes automated deployment via GitHub Actions (`.github/workflows/deploy.yml`).

### Prerequisites

**GitHub Secrets Required:**
- `SSH_HOST` - Server IP address (⚠️ use Elastic IP to avoid changes)
- `SSH_USER` - Server username (e.g., `ubuntu`)
- `SSH_KEY` - Private SSH key for server authentication

### How It Works

1. **Trigger**: Push to `main` branch
2. **Steps**:
   - Run tests
   - Build webapp
   - SSH to server
   - Pull latest code
   - Build Docker containers
   - Restart services

### Common Issues

#### SSH Authentication Failed

**Error:**
```
ssh: handshake failed: ssh: unable to authenticate
```

**Cause**: IP address changed (AWS EC2 restart without Elastic IP)

**Fix:**
1. Get new server IP:
   ```bash
   curl -s http://checkip.amazonaws.com
   ```

2. Update GitHub Secret:
   - Go to: https://github.com/chollak/finance-tracker-backend/settings/secrets/actions
   - Edit `SSH_HOST`
   - Enter new IP address
   - Save

3. Configure Elastic IP (Recommended):
   - AWS Console → EC2 → Elastic IPs
   - Allocate new Elastic IP
   - Associate with your EC2 instance
   - Update `SSH_HOST` with Elastic IP
   - **Benefit**: IP won't change on restart

**See also**: [Troubleshooting - SSH Authentication Failed](docs/knowledge-base/08-development/troubleshooting.md#ssh-authentication-failed-github-actions)

#### Manual Deployment Trigger

To manually trigger deployment:
1. Go to: https://github.com/chollak/finance-tracker-backend/actions
2. Select "Deploy to Server" workflow
3. Click "Run workflow" → Run on `main`

## 🔄 Future Updates

With database in gitignore, future deployments will be:
1. `git pull origin main`
2. `npm install`
3. `npm run build`
4. `pm2 reload finance-tracker` (or restart services)

No database migration needed unless schema changes are made.

---

**Note**: This deployment creates a fresh database from your Notion data. All transactions and relationships will be preserved with the new telegramId schema.