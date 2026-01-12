# Finance Tracker Backend - Knowledge Base

Структурированная база знаний для эффективной работы над проектом.

## Обзор проекта

Finance Tracker Backend — это backend система для управления личными финансами, построенная по принципам **Clean Architecture**. Проект поддерживает REST API для веб-клиентов и Telegram Bot для голосового ввода транзакций.

### Tech Stack

- **Backend**: Node.js, TypeScript, Express
- **Database**: SQLite (TypeORM) / Supabase (PostgreSQL)
- **AI**: OpenAI (Whisper для транскрипции, GPT-4 для парсинга)
- **Bot**: Telegraf (Telegram Bot Framework)
- **Frontend**: React + Vite
- **Development**: ts-node-dev, Jest, Docker

### Ключевые возможности

- 🎤 Voice-to-Transaction через Telegram Bot
- 💰 Transaction Management с CRUD операциями
- 📊 Budget Tracking с алертами
- 📈 Analytics & Financial Health Score
- 🤖 Machine Learning для улучшения категоризации
- 💻 Web Interface (React SPA)

---

## Навигация по документации

### 🏗️ [Architecture](01-architecture/)

Как устроена система, модули, паттерны проектирования:

- [**Overview**](01-architecture/overview.md) - Clean Architecture layers, dependency flow
- [**Modules**](01-architecture/modules.md) - 5 модулей системы, их зависимости
- [**Patterns**](01-architecture/patterns.md) - Repository, DI, Factory, Use Case, Result Pattern

### 🔄 [Data Flow](07-data-flow/)

Как данные движутся через систему:

- [**Voice → Transaction**](07-data-flow/voice-to-transaction.md) - Обработка голосового ввода
- [**API Lifecycle**](07-data-flow/api-lifecycle.md) - HTTP request → response flow
- [**Budget Calculation**](07-data-flow/budget-calculation.md) - Расчет spent amount

### 🛠️ [Development Guide](08-development/)

Как работать с проектом:

- [**Quick Start**](08-development/quick-start.md) - Запуск проекта, environment setup
- [**Adding Features**](08-development/adding-features.md) - Как добавлять use cases, endpoints, модули
- [**Database Guide**](08-development/database-guide.md) - SQLite vs Supabase, миграции
- [**Troubleshooting**](08-development/troubleshooting.md) - Частые проблемы и решения

---

## Критичные файлы проекта

### Application Entry Points
- [`src/index.ts:1`](../../src/index.ts) - Главная точка входа приложения
- [`src/appModules.ts:8`](../../src/appModules.ts) - Создание и композиция модулей

### Module Structure
- [`src/modules/transaction/transactionModule.ts`](../../src/modules/transaction/transactionModule.ts) - Transaction Module
- [`src/modules/budget/budgetModule.ts`](../../src/modules/budget/budgetModule.ts) - Budget Module
- [`src/modules/voiceProcessing/voiceProcessingModule.ts`](../../src/modules/voiceProcessing/voiceProcessingModule.ts) - Voice Processing Module

### Infrastructure
- [`src/shared/infrastructure/database/repositoryFactory.ts`](../../src/shared/infrastructure/database/repositoryFactory.ts) - Repository Factory (SQLite/Supabase)
- [`src/shared/infrastructure/database/database.config.ts`](../../src/shared/infrastructure/database/database.config.ts) - Database configuration
- [`src/shared/infrastructure/config/appConfig.ts`](../../src/shared/infrastructure/config/appConfig.ts) - Environment configuration

### Delivery Layer
- [`src/delivery/web/express/expressServer.ts`](../../src/delivery/web/express/expressServer.ts) - REST API Server
- [`src/delivery/messaging/telegram/telegramBot.ts`](../../src/delivery/messaging/telegram/telegramBot.ts) - Telegram Bot

---

## Быстрые команды

```bash
# Разработка (full-stack с hot reload)
npm run dev:full

# Backend only
npm run dev

# Production build
npm run build
npm run serve

# Tests
npm test

# Docker
docker compose up -d --build
```

---

## Архитектурные решения

### Почему Clean Architecture?
- **Testability** - легко тестировать бизнес-логику изолированно
- **Maintainability** - изменения в одном слое не влияют на другие
- **Flexibility** - легко менять технологии (например, базу данных)
- **Scalability** - модульная структура позволяет расти постепенно

### Почему Dual Database Support?
- **Development** - SQLite для быстрого старта без облачных зависимостей
- **Production** - Supabase для масштабируемости и real-time возможностей
- **Migration** - постепенный переход от SQLite к Supabase

### Machine Learning System
- Система обучается на пользовательских исправлениях
- Улучшает категоризацию и распознавание мерчантов
- Хранит паттерны в `data/patterns.json`

---

## Module Dependencies

```
TransactionModule (independent)
    ↑
    ├─── BudgetModule (нужен для расчета spent)
    ├─── VoiceProcessingModule (использует CreateTransactionUseCase)
    └─── DashboardModule (агрегирует analytics)
```

---

## Дополнительные ресурсы

### Существующая документация
- [PROJECT_DOCUMENTATION.md](../../PROJECT_DOCUMENTATION.md) - Полная техническая документация
- [SUPABASE_MIGRATION.md](../../SUPABASE_MIGRATION.md) - Гайд по миграции на Supabase
- [CLAUDE.md](../../CLAUDE.md) - Команды разработки для Claude Code

### External Resources
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) - Principles by Uncle Bob
- [TypeORM Docs](https://typeorm.io/) - Database ORM
- [OpenAI API](https://platform.openai.com/docs/api-reference) - AI integration

---

## Расширение документации

Текущая база знаний сфокусирована на Architecture, Data Flow и Development Guide.

**Будущие разделы** (по необходимости):
- `02-domain-models/` - Подробные описания entities
- `03-use-cases/` - Детали каждого use case
- `04-infrastructure/` - Repository implementations, external services
- `05-api-specifications/` - Полная API документация
- `06-integrations/` - Telegram, OpenAI, Frontend hooks

---

**Последнее обновление**: 2026-01-09
