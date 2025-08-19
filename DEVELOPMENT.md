# 🛠️ Local Development Guide

Complete guide for setting up local development environment for Finance Tracker with Telegram Bot and Mini App testing.

## 🚀 Quick Start

### 1. Initial Setup
```bash
# Copy environment template
cp .env.development .env.local

# Edit .env.local with your API keys
nano .env.local

# Install dependencies
npm install
```

### 2. Start Development Environment
```bash
# Full development setup (backend + frontend)
npm run dev:full

# With ngrok tunnel for Telegram testing
npm run dev:tunnel

# Backend only
npm run dev:backend

# Just ngrok tunnel
npm run dev:ngrok
```

## 📋 Environment Configuration

### Required API Keys (.env.local)
```env
# Your actual API keys
OPENAI_API_KEY=your_openai_key_here
NOTION_API_KEY=your_notion_key_here  
NOTION_DATABASE_ID=your_notion_database_id_here
TG_BOT_API_KEY=your_telegram_bot_key_here

# Development settings
NODE_ENV=development
PORT=3000
WEB_APP_URL=http://localhost:3000
ENABLE_TELEGRAM_POLLING=true
WEBHOOK_MODE=false
```

## 🌐 Development URLs

When running locally:
- **Backend API**: http://localhost:3000/api
- **Frontend Dev**: http://localhost:5173  
- **Production Build**: http://localhost:3000/webapp
- **ngrok Tunnel**: https://random-url.ngrok.io (when using --tunnel)

## 🤖 Telegram Bot Testing

### Local Testing (Polling Mode)
```bash
npm run dev:full
```
- Bot uses polling mode (no webhook needed)
- Web app URLs point to localhost
- Perfect for basic bot command testing

### Production-like Testing (Webhook Mode)  
```bash
npm run dev:tunnel
```
- Starts ngrok tunnel automatically
- Updates .env.local with tunnel URL
- Bot can receive webhooks from Telegram
- Mini app works exactly like production

### Test Commands in Telegram
- `/start` - Start bot and get main menu
- Send voice message - Test voice processing
- Send text like "spent 50$ on coffee" - Test transaction parsing
- Click "📊 View Transactions" - Test mini app

## 📱 Mini App Development

### Local Development
```bash
cd webapp
npm run dev
```
- Runs on http://localhost:5173
- Proxies API calls to localhost:3000
- Hot reload enabled
- Uses development user ID (configurable)

### Testing in Telegram
1. Start with tunnel: `npm run dev:tunnel`
2. Open bot in Telegram
3. Click any web app button
4. Mini app opens with your local code

### Development Features
- **DevMode component**: Shows debug info (top-right corner)
- **API logging**: All requests logged in development
- **Mock Telegram environment**: Works without Telegram WebApp
- **Test user ID**: Configurable in `src/config/env.ts`

## 🔧 Development Scripts

```bash
# Full development environment
npm run dev:full

# With ngrok tunnel for webhooks
npm run dev:tunnel  

# Backend only (for frontend-only development)
npm run dev:backend

# Start only ngrok tunnel
npm run dev:ngrok

# Regular backend development
npm run dev

# Frontend development
cd webapp && npm run dev
```

## 🧪 Testing Features

### API Testing
```bash
# Test transaction API
curl http://localhost:3000/api/transactions

# Test dashboard API  
curl http://localhost:3000/api/dashboard/131184740

# Test with your user ID
curl http://localhost:3000/api/transactions/users/YOUR_USER_ID
```

### Database Testing
```bash
# Create backup
node scripts/create-backup.js

# Restore from backup
node scripts/restore-data.js data/backup.json

# Check database
sqlite3 data/database.sqlite "SELECT COUNT(*) FROM transactions;"
```

## 🐛 Development Tips

### 1. **Separate Development Bot** (Recommended)
- Create a separate Telegram bot for development
- Use different bot token in .env.local
- Prevents conflicts with production

### 2. **Frontend Development**
- DevMode component shows all debug info
- Check browser console for API logs
- Use React DevTools for component debugging

### 3. **Backend Development**
- ts-node-dev provides hot reload
- Database synchronization enabled in development
- All API requests logged

### 4. **ngrok Tips**
- Free account has session limits
- Tunnel URL changes on restart
- Use `npm run dev:tunnel` for automatic setup

## 🔍 Troubleshooting

### Bot Not Responding
```bash
# Check if bot token is valid
curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe

# Check webhook status
curl https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo
```

### API Errors
- Check .env.local has correct keys
- Verify backend is running on port 3000
- Check browser network tab for actual errors

### Database Issues
```bash
# Reset local database
rm data/database.sqlite
npm run dev

# Check database tables
sqlite3 data/database.sqlite ".tables"
```

### Frontend Issues
- Clear browser cache
- Check if backend is running
- Verify API proxy in Vite config

## 📁 Project Structure

```
├── .env.local              # Development environment
├── scripts/
│   ├── dev-setup.js        # Development orchestrator
│   ├── start-ngrok.js      # ngrok tunnel manager
│   └── ...
├── webapp/
│   ├── src/config/env.ts   # Development configuration
│   ├── src/components/DevMode.tsx  # Development helper
│   └── ...
└── src/
    └── shared/infrastructure/config/appConfig.ts  # Environment handling
```

## 🚀 Deployment Workflow

```bash
# 1. Development
npm run dev:tunnel

# 2. Test everything locally

# 3. Commit changes
git add .
git commit -m "feat: new feature"

# 4. Deploy to server
git push origin main

# 5. Server updates automatically
```

This setup gives you a complete local development environment that mirrors production! 🎉