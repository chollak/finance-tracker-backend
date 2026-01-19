# Architecture Overview

Проект построен по принципам **Clean Architecture** с четким разделением на слои и зависимостями, направленными внутрь к domain layer.

## Clean Architecture Layers

Система организована в 4 слоя, каждый с определенной ответственностью:

### 1. **Domain Layer** (Ядро системы)
Бизнес-логика и правила, независимые от внешних технологий.

**Содержит:**
- Entities (Transaction, Budget)
- Repository Interfaces (абстракции доступа к данным)
- Value Objects (Result, CreateTransactionData)
- Domain Services (бизнес-правила)

**Зависимости:** НЕТ внешних зависимостей

**Файлы:** `src/modules/*/domain/`

### 2. **Application Layer** (Use Cases)
Оркестрация бизнес-логики, реализация сценариев использования.

**Содержит:**
- Use Cases (CreateTransactionUseCase, GetBudgetsUseCase)
- Application Services (AnalyticsService, BudgetService, DashboardService)
- DTOs (Data Transfer Objects)

**Зависимости:** Domain Layer

**Файлы:** `src/modules/*/application/`

### 3. **Infrastructure Layer** (Внешние сервисы)
Реализация технических деталей и интеграций с внешним миром.

**Содержит:**
- Repository Implementations (SqliteTransactionRepository, SupabaseBudgetRepository)
- External Services (OpenAITranscriptionService)
- Database Configuration (database.config.ts, supabase.config.ts)
- File System Operations

**Зависимости:** Domain Layer (через интерфейсы)

**Файлы:** `src/modules/*/infrastructure/`, `src/shared/infrastructure/`

### 4. **Presentation Layer** (Delivery Mechanisms)
Точки входа в систему, взаимодействие с внешними клиентами.

**Содержит:**
- Controllers (TransactionController, BudgetController)
- REST API Routes (Express)
- Telegram Bot Handlers
- Middleware (error handling, logging)

**Зависимости:** Application Layer (use cases)

**Файлы:** `src/modules/*/presentation/`, `src/delivery/`

## Dependency Flow

```
┌─────────────────────────────────────┐
│     Presentation Layer              │
│  (Controllers, Routes, Bot)         │
└──────────────┬──────────────────────┘
               │ зависит от
               ↓
┌─────────────────────────────────────┐
│      Application Layer              │
│  (Use Cases, Services)              │
└──────────────┬──────────────────────┘
               │ зависит от
               ↓
┌─────────────────────────────────────┐
│        Domain Layer                 │
│  (Entities, Interfaces)             │
└──────────────△──────────────────────┘
               │ реализует
               │
┌──────────────┴──────────────────────┐
│    Infrastructure Layer             │
│  (Repository Impl, External)        │
└─────────────────────────────────────┘
```

**Правило**: Зависимости всегда указывают **внутрь** (к Domain Layer)

## Модули системы

Система состоит из 6 основных модулей:

| Модуль | Назначение | Зависимости |
|--------|------------|-------------|
| **TransactionModule** | CRUD операций транзакций + analytics | Независимый |
| **BudgetModule** | Управление бюджетами | TransactionModule (для расчета spent) |
| **DebtModule** | Управление долгами (кто кому должен) | TransactionModule (для linked транзакций) |
| **VoiceProcessingModule** | Обработка голоса/текста | TransactionModule (CreateTransactionUseCase) |
| **OpenAIUsageModule** | Мониторинг использования OpenAI API | Независимый |
| **DashboardModule** | Агрегация данных из всех модулей | TransactionModule, BudgetModule |

Подробнее: [Modules](modules.md)

## Принципы архитектуры

### 1. **Dependency Inversion Principle (DIP)**
- High-level modules не зависят от low-level modules
- Оба зависят от абстракций (interfaces)
- Пример: Use Case зависит от `TransactionRepository` interface, а не от конкретной реализации

### 2. **Single Responsibility Principle (SRP)**
- Каждый Use Case отвечает за одну бизнес-операцию
- Каждый Repository отвечает только за доступ к данным одной entity

### 3. **Interface Segregation Principle (ISP)**
- Маленькие, специализированные interfaces
- Клиенты не зависят от методов, которые не используют

### 4. **Open/Closed Principle**
- Легко добавить новую реализацию Repository (например, MongoDB) без изменения Use Cases
- Легко добавить новый Use Case без изменения Domain Layer

## Ключевые архитектурные решения

### Почему Clean Architecture?
✅ **Testability** - легко мокировать зависимости
✅ **Maintainability** - изменения изолированы в своих слоях
✅ **Flexibility** - легко менять технологии (БД, фреймворки)
✅ **Scalability** - модульная структура растет постепенно

### Почему модули?
✅ **Cohesion** - связанная функциональность вместе
✅ **Decoupling** - слабая связь между модулями
✅ **Reusability** - модули можно переиспользовать
✅ **Parallel Development** - команды могут работать параллельно

### Почему Repository Pattern?
✅ **Abstraction** - бизнес-логика не знает о деталях БД
✅ **Testability** - легко мокировать доступ к данным
✅ **Flexibility** - легко переключаться между SQLite и Supabase

## Критичные файлы

### Application Bootstrap
- [`src/index.ts`](../../../src/index.ts) - Точка входа приложения
- [`src/appModules.ts`](../../../src/appModules.ts) - Создание и композиция модулей

### Infrastructure Config
- [`src/shared/infrastructure/config/appConfig.ts`](../../../src/shared/infrastructure/config/appConfig.ts) - Environment configuration
- [`src/shared/infrastructure/database/database.config.ts`](../../../src/shared/infrastructure/database/database.config.ts) - Database setup
- [`src/shared/infrastructure/database/repositoryFactory.ts`](../../../src/shared/infrastructure/database/repositoryFactory.ts) - Repository selection

### Delivery Layer
- [`src/delivery/web/express/expressServer.ts`](../../../src/delivery/web/express/expressServer.ts) - REST API
- [`src/delivery/messaging/telegram/telegramBot.ts`](../../../src/delivery/messaging/telegram/telegramBot.ts) - Telegram Bot

## См. также

- [Modules](modules.md) - Детальная информация о каждом модуле
- [Patterns](patterns.md) - Design patterns используемые в проекте
- [Data Flow](../07-data-flow/) - Как данные движутся через слои
