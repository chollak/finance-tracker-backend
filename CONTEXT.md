# Project Context for Claude Code

## Current Status
- ✅ SQLite migration completed (replaced Notion DB)  
- ✅ 5 transactions migrated, 10 categories, 1 user
- ✅ TypeORM + Clean Architecture implemented
- ✅ Frontend edit functionality fixed
- ✅ Telegram bot integration working

## Architecture
- **Backend**: Node.js + TypeScript + Express + SQLite
- **Database**: TypeORM entities (User, Transaction, Category, Account, Budget)
- **Frontend**: React + Vite (in webapp/ folder)
- **Bot**: Telegraf integration
- **Structure**: Clean Architecture (Domain/Application/Infrastructure)

## Quick Commands
- `npm run dev` - Development server
- `npm test` - Run tests  
- `npm run build` - TypeScript compilation
- `node scripts/quick-status.js` - Project status
- `node scripts/inspect-db.js` - Database overview

## Recent Changes
- Migrated from Notion to SQLite database
- Fixed enum compatibility for SQLite
- Updated modules to use SqliteTransactionRepository
- Fixed frontend edit URL routing issue

## Known Working Features  
- Voice transaction input via Telegram
- Web interface for viewing/editing transactions
- AI-powered transaction parsing
- Category management with icons
- Transaction confidence scoring

## Token Optimization Workflow

### Starting a Claude Session:
1. Run: `node scripts/session-start.js` 
2. Copy output and paste as session context
3. Be specific: "Working on [exact file path] for [specific issue]"

### For Debugging:
1. Run: `node scripts/error-context.js`
2. Share only relevant error sections
3. Use: `node scripts/explore.js src` to find exact paths

### For Development:
1. Use targeted searches: `grep` and `glob` instead of reading large files
2. Reference this CONTEXT.md instead of re-explaining architecture
3. Batch related changes in one conversation

### Efficient Communication Patterns:
- ✅ "Fix validation in src/entities/Budget.ts line 25"
- ✅ "Add tests to src/modules/transaction/application/"  
- ❌ "Something is wrong with my app"
- ❌ "Review all my code"

Use this context to minimize token usage in conversations.