# Finance Tracker Backend - Complete Developer Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Getting Started](#getting-started)
3. [Architecture & Design Patterns](#architecture--design-patterns)
4. [Module System](#module-system)
5. [API Endpoints](#api-endpoints)
6. [Data Flow](#data-flow)
7. [Database Schema](#database-schema)
8. [Development Workflow](#development-workflow)
9. [Testing](#testing)
10. [Deployment](#deployment)
11. [Troubleshooting](#troubleshooting)

---

## Project Overview

The Finance Tracker Backend is a comprehensive financial management system built with **Clean Architecture** principles. It provides both REST API endpoints and Telegram bot functionality for managing personal finances.

### Key Features
- 🎤 **Voice Processing**: Convert voice messages to transactions using OpenAI
- 💰 **Transaction Management**: Full CRUD operations for financial transactions
- 📊 **Budget Tracking**: Create and monitor budgets with alerts
- 📈 **Analytics & Insights**: Financial health scoring and spending analytics
- 🤖 **Telegram Bot**: Voice and text input through Telegram
- 💻 **Web Interface**: React frontend with real-time updates
- 📊 **Usage Monitoring**: Track OpenAI API usage and costs

### Tech Stack
- **Backend**: Node.js, Express, TypeScript
- **Database**: SQLite with TypeORM
- **AI Integration**: OpenAI API for transcription and parsing
- **Bot Framework**: Telegraf
- **Frontend**: React, Vite
- **Development**: ts-node-dev, Jest, Docker

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- SQLite3

### Environment Setup
Create a `.env` file with these required variables:

```bash
# Required - Application will fail without these
OPENAI_API_KEY=your_openai_api_key
NOTION_API_KEY=your_notion_key  # Legacy - still required
NOTION_DATABASE_ID=your_database_id  # Legacy - still required

# Optional
TG_BOT_API_KEY=your_telegram_bot_token
WEB_APP_URL=http://localhost:3000
NODE_ENV=development
PORT=3000
```

### Installation & Running

```bash
# Install all dependencies (backend + frontend)
npm install

# Development - Full stack with hot reload (RECOMMENDED)
npm run dev:full
# Backend: http://localhost:3000 (API + static files)
# Frontend: http://localhost:5173 (React dev server)

# Alternative development modes
npm run dev          # Backend only
npm run dev:backend  # Backend only (alias)
npm run dev:frontend # Frontend only

# Production build and run
npm run build
npm run serve

# Testing
npm test

# Docker
docker compose up -d --build
```

---

## Architecture & Design Patterns

### Clean Architecture Implementation

The project strictly follows **Clean Architecture** with these layers:

```
src/
├── modules/                    # Business modules (bounded contexts)
│   ├── {module}/
│   │   ├── domain/            # Entities, repositories (interfaces)
│   │   ├── application/       # Use cases, services
│   │   ├── infrastructure/    # External service implementations
│   │   └── presentation/      # Controllers, routes
├── shared/                    # Cross-cutting concerns
├── delivery/                  # Framework-specific entry points
└── index.ts                   # Application bootstrap
```

### Key Design Patterns

1. **Dependency Injection**: Modules create and inject dependencies
2. **Repository Pattern**: Abstract data access through interfaces
3. **Use Case Pattern**: Each business operation is a separate class
4. **Module Pattern**: Self-contained business domains
5. **Factory Pattern**: Module creation and configuration

### Dependency Flow
```
Infrastructure → Application → Domain
      ↑              ↑
  Controllers   Use Cases   Entities
```

**Rule**: Dependencies always point inward. Domain layer has no external dependencies.

---

## Module System

The application is organized into 5 main modules, created in `src/appModules.ts`:

### 1. TransactionModule
**Purpose**: Core transaction CRUD operations and analytics

**Use Cases**:
- `CreateTransactionUseCase` - Add new transactions
- `GetTransactionsUseCase` - Fetch transaction lists
- `GetUserTransactionsUseCase` - User-specific transactions
- `UpdateTransactionUseCase` - Modify existing transactions
- `DeleteTransactionUseCase` - Remove transactions
- `AnalyticsService` - Generate insights and statistics

**Infrastructure**: `SqliteTransactionRepository` - SQLite persistence

### 2. VoiceProcessingModule
**Purpose**: Convert voice/text input to structured transactions

**Dependencies**: Depends on TransactionModule's `CreateTransactionUseCase`

**Use Cases**:
- `ProcessVoiceInputUseCase` - Convert audio → text → transaction
- `ProcessTextInputUseCase` - Parse text → transaction

**Infrastructure**: `OpenAITranscriptionService` - OpenAI integration

### 3. BudgetModule
**Purpose**: Budget creation, monitoring, and alerts

**Dependencies**: Uses TransactionModule for spending analysis

**Use Cases**:
- `CreateBudgetUseCase` - Set spending limits
- `GetBudgetsUseCase` - Fetch user budgets
- `UpdateBudgetUseCase` - Modify budget parameters
- `DeleteBudgetUseCase` - Remove budgets

### 4. OpenAIUsageModule
**Purpose**: Track and monitor OpenAI API costs

**Use Cases**:
- `GetOpenAIUsageUseCase` - Fetch usage statistics
- Cost tracking and money formatting utilities

### 5. DashboardModule
**Purpose**: Aggregate insights across modules

**Dependencies**: Uses AnalyticsService and BudgetService

**Features**:
- Financial health scoring
- Weekly spending insights
- Budget alerts and warnings
- Complete dashboard views

---

## API Endpoints

All API endpoints are prefixed with `/api` and organized by module:

### Health Check
- `GET /api/health` - Application health status

### Transactions (`/api/transactions`)
- `POST /` - Create transaction
- `GET /` - List all transactions
- `GET /user/:userId` - User-specific transactions
- `PUT /:id` - Update transaction
- `DELETE /:id` - Delete transaction
- `PUT /:id/learn` - Update with learning

### Voice Processing (`/api/voice`)
- `POST /process-voice` - Upload audio file for processing
- `POST /process-text` - Parse text input to transaction

### Budgets (`/api/budgets`)
- `POST /` - Create budget
- `GET /:userId` - Get user budgets
- `PUT /:id` - Update budget
- `DELETE /:id` - Delete budget

### Dashboard (`/api/dashboard`)
- `GET /:userId` - Complete dashboard data
- `GET /insights/:userId` - Financial insights
- `GET /insights/:userId/weekly` - Weekly analytics
- `GET /insights/:userId/health-score` - Financial health score
- `GET /alerts/:userId` - Budget alerts
- `GET /:userId/quick-stats` - Quick statistics

### OpenAI Usage (`/api/openai`)
- `GET /usage` - API usage statistics
- `GET /usage/summary` - Usage summary

---

## Data Flow

### Voice-to-Transaction Flow
```
Voice Input → Telegram Bot → VoiceProcessingModule
     ↓
OpenAI Transcription → Text Parsing → Transaction Creation
     ↓
SQLite Storage → Response to User
```

### Web App Flow
```
React Frontend → Express API → Module Use Cases
     ↓
Business Logic → Repository → SQLite Database
     ↓
Response → JSON → Frontend Update
```

### Module Interaction Example
```typescript
// In appModules.ts
const transactionModule = TransactionModule.create();
const voiceModule = new VoiceProcessingModule(
  openAIService, 
  transactionModule  // Dependency injection
);

// VoiceProcessingModule uses TransactionModule
processVoiceInput.execute(audioFile) {
  const text = await openAIService.transcribe(audioFile);
  const parsed = await openAIService.parseTransaction(text);
  
  // Uses injected CreateTransactionUseCase
  return await this.createTransactionUseCase.execute(parsed);
}
```

---

## Database Schema

The application uses **SQLite** with **TypeORM** for database operations.

### Main Entities

#### Transaction Entity (`src/shared/infrastructure/database/entities/Transaction.ts`)
```typescript
@Entity()
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: string;

  @Column()
  description: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column()
  category: string;

  @Column()
  type: 'income' | 'expense';

  @Column()
  date: Date;

  @Column({ nullable: true })
  location?: string;

  @Column({ default: false })
  isRecurring: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

#### Budget Entity (`src/shared/infrastructure/database/entities/Budget.ts`)
```typescript
@Entity()
export class Budget {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: string;

  @Column()
  category: string;

  @Column('decimal', { precision: 10, scale: 2 })
  limit: number;

  @Column()
  period: 'weekly' | 'monthly' | 'yearly';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Database Configuration
- **Location**: `data/database.sqlite`
- **Connection**: Configured in `src/shared/infrastructure/database/database.config.ts`
- **Migrations**: Auto-sync enabled in development
- **Backup Scripts**: Available in `scripts/` directory

---

## Development Workflow

### Project Structure Best Practices

1. **Adding New Features**:
   - Create in appropriate module's `application/` folder
   - Add repository method if needed in `domain/`
   - Implement in `infrastructure/` if external service required
   - Add controller/route in `presentation/`

2. **Module Dependencies**:
   - Modules can depend on other modules
   - Always inject dependencies through constructors
   - Update `appModules.ts` for new dependencies

3. **Database Changes**:
   - Modify entities in `src/shared/infrastructure/database/entities/`
   - Update repository interfaces and implementations
   - Test with existing data

### Code Conventions

- **TypeScript strict mode** enabled
- **Clean Architecture** - dependencies point inward
- **Single Responsibility** - one use case per class
- **Interface Segregation** - small, focused interfaces
- **Dependency Injection** - constructor injection pattern

### Development Commands

```bash
# Code quality checks
npm run check:deps         # Check dependency rules
npm run check:circular     # Find circular dependencies
npm run analyze           # Run both dependency checks
npm run format            # Format code with Prettier

# Database operations
npm run migrate:notion    # Legacy Notion migration
node scripts/init-database.js     # Initialize fresh database
node scripts/create-backup.js     # Backup current database
```

---

## Testing

### Test Structure
Tests are located in the `tests/` directory with `.test.ts` suffix.

### Test Categories

1. **Unit Tests**: Individual use cases and services
   - `createTransaction.test.ts`
   - `processTextInput.test.ts`
   - `analytics.test.ts`

2. **Integration Tests**: Module interactions
   - `budget.test.ts`
   - `dashboardService.test.ts`

3. **Repository Tests**: Database operations
   - `getTransactions.test.ts`
   - `getUserTransactions.test.ts`

### Running Tests
```bash
npm test                  # Run all tests
npm test -- --watch      # Watch mode
npm test -- --verbose    # Detailed output
npm test budget          # Run specific test file
```

### Test Configuration
- **Framework**: Jest with ts-jest preset
- **Environment**: Node.js
- **Configuration**: `jest.config.js`

### Writing Tests
```typescript
// Example test structure
describe('CreateTransactionUseCase', () => {
  let useCase: CreateTransactionUseCase;
  let mockRepository: jest.Mocked<TransactionRepository>;

  beforeEach(() => {
    mockRepository = createMockRepository();
    useCase = new CreateTransactionUseCase(mockRepository);
  });

  it('should create transaction successfully', async () => {
    // Test implementation
  });
});
```

---

## Deployment

### Docker Deployment (Recommended)

The project includes complete Docker configuration:

```bash
# Build and run
docker compose up -d --build

# View logs
docker compose logs -f

# Stop
docker compose down
```

### Docker Configuration
- **Base Image**: Node.js 18 Alpine
- **Multi-stage build**: Optimized production image
- **Health checks**: Built-in health monitoring
- **Volume mounts**: Persistent SQLite database
- **Environment**: Production configuration

### Manual Deployment

```bash
# 1. Build the application
npm run build

# 2. Install production dependencies
npm ci --production

# 3. Set environment variables
export NODE_ENV=production
export PORT=3000

# 4. Start the server
npm run serve
```

### Environment Configuration

#### Development
- SQLite database in `data/` directory
- Hot reload enabled
- Debug logging active
- CORS allowed from localhost

#### Production
- Environment validation enforced
- Security headers enabled
- Request logging
- Graceful shutdown handling

---

## Troubleshooting

### Common Issues

#### 1. Environment Variables Missing
**Error**: `Configuration validation failed`
**Solution**: Check `.env` file has required variables:
```bash
OPENAI_API_KEY=sk-...
NOTION_API_KEY=secret_...
NOTION_DATABASE_ID=...
```

#### 2. Database Connection Issues
**Error**: `SQLITE_CANTOPEN: unable to open database file`
**Solution**: 
- Ensure `data/` directory exists
- Check file permissions
- Run database initialization: `node scripts/init-database.js`

#### 3. Port Already in Use
**Error**: `EADDRINUSE: address already in use :::3000`
**Solution**:
```bash
# Find process using port
lsof -i :3000
# Kill process
kill -9 <PID>
# Or use different port
PORT=3001 npm run dev
```

#### 4. OpenAI API Errors
**Error**: `Invalid API key` or `Rate limit exceeded`
**Solution**:
- Verify API key is valid and has credits
- Check usage in OpenAI dashboard
- Implement retry logic for rate limits

#### 5. Module Import Errors
**Error**: `Cannot resolve module` or circular dependency
**Solution**:
- Check import paths are correct
- Run `npm run check:circular` to find circular dependencies
- Ensure module exports are properly defined

### Development Debugging

#### Enable Debug Logging
```bash
DEBUG=* npm run dev  # All debug output
DEBUG=app:* npm run dev  # App-specific logging
```

#### Database Inspection
```bash
# Connect to SQLite database
sqlite3 data/database.sqlite

# Common queries
.tables  # List all tables
.schema Transaction  # Show table schema
SELECT * FROM transaction LIMIT 10;  # Sample data
```

#### Health Check Endpoint
```bash
curl http://localhost:3000/api/health
```

### Performance Issues

#### High Memory Usage
- Check for memory leaks in long-running operations
- Monitor database connection pooling
- Review OpenAI API response handling

#### Slow API Responses
- Add database indexes for frequently queried fields
- Implement caching for analytics calculations
- Optimize transaction queries with proper WHERE clauses

### Production Monitoring

#### Log Files
- Application logs: Check Docker container logs
- Access logs: Monitor request patterns
- Error logs: Track failure rates

#### Health Monitoring
- Use `/api/health` endpoint for uptime monitoring
- Monitor database file size growth
- Track OpenAI API usage and costs

---

## Additional Resources

### File Locations
- **Configuration**: `src/shared/infrastructure/config/appConfig.ts`
- **Database Setup**: `src/shared/infrastructure/database/database.config.ts`
- **Error Handling**: `src/delivery/web/express/middleware/errorMiddleware.ts`
- **Telegram Bot**: `src/delivery/messaging/telegram/telegramBot.ts`

### External Dependencies
- **OpenAI SDK**: Transaction parsing and voice transcription
- **TypeORM**: Database ORM with decorators
- **Telegraf**: Telegram bot framework
- **Express**: Web server framework
- **React + Vite**: Frontend development stack

### Learning Resources
- [Clean Architecture Principles](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [TypeORM Documentation](https://typeorm.io/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

---

## Contributing

When contributing to this project:

1. **Follow Clean Architecture** - keep layers separated
2. **Write Tests** - especially for use cases and services
3. **Update Documentation** - keep this file current
4. **Check Dependencies** - run `npm run analyze` before committing
5. **Environment Variables** - document any new required variables

For questions about the architecture or specific implementations, refer to the individual module documentation and test files for examples.