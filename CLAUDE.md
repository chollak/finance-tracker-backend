# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Build and Run:**
- `npm run build` - Compile TypeScript to JavaScript in `dist/` folder
- `npm run serve` - Run the compiled application from `dist/index.js`
- `npm run dev` - Development mode with auto-reload using ts-node-dev

**Testing:**
- `npm test` - Run Jest tests (located in `tests/` folder)
- Tests use ts-jest preset and target Node.js environment

**Web App (React + Vite):**
- `npm run install:webapp` - Install webapp dependencies
- `npm run build:webapp` - Build React frontend to `public/webapp/`
- `cd webapp && npm run dev` - Run webapp in development mode

**Docker:**
- `docker compose up -d --build` - Build and run in container
- `docker compose logs -f` - View container logs
- `docker compose down` - Stop and remove containers

## Environment Configuration

Required environment variables in `.env` file:
- `OPENAI_API_KEY` - For voice transcription and transaction parsing
- `NOTION_API_KEY` - For database operations
- `NOTION_DATABASE_ID` - Target Notion database ID
- `TG_BOT_API_KEY` - Telegram bot token
- `WEB_APP_URL` - Public URL for the web application

The application validates these on startup and will exit with descriptive errors if `NOTION_API_KEY` or `NOTION_DATABASE_ID` are missing.

## Architecture Overview

This project follows **Clean Architecture** principles with clear separation between layers:

### Module System
The application is organized into two main modules created in `src/appModules.ts`:

1. **TransactionModule** - Handles CRUD operations for financial transactions
2. **VoiceProcessingModule** - Processes voice/text input and creates transactions

**Key dependency:** VoiceProcessingModule depends on TransactionModule through `CreateTransactionUseCase`.

### Layer Structure
Each module follows the same architectural pattern:

- **Domain** - Business entities and repository interfaces
- **Application** - Use cases and business logic services  
- **Infrastructure** - External service implementations (Notion, OpenAI)
- **Interfaces** - Controllers and API endpoints

### Entry Points
The application has two main entry points that share the same module instances:

1. **Express HTTP Server** (`src/framework/express/`) - REST API under `/api` prefix
2. **Telegram Bot** (`src/framework/telegram/`) - Bot commands and voice processing

### Data Flow
Voice commands → OpenAI Transcription → Transaction Parser → Notion Storage
Text input → Transaction Parser → Notion Storage

## Project Structure Notes

- **Source**: All TypeScript code in `src/` compiles to `dist/`
- **Frontend**: React app in `webapp/` builds to `public/webapp/` for Express serving
- **Tests**: Jest tests in `tests/` folder with `.test.ts` suffix
- **Static Assets**: Express serves webapp at `/webapp` path and API at `/api`

## Integration Points

- **Notion**: Primary database using @notionhq/client
- **OpenAI**: Voice transcription using openai package
- **Telegram**: Bot interface using telegraf package
- **Express**: HTTP server with cors and multer for file uploads