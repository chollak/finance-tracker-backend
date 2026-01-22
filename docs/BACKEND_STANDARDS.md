# Backend Coding Standards

Этот документ определяет обязательные стандарты для написания кода в бэкенде. Все новые изменения должны следовать этим правилам. Существующий код будет постепенно приводиться к этим стандартам.

**Версия:** 1.0
**Дата:** 2026-01-22
**Статус:** Утверждено

---

## Содержание

1. [Error Handling](#1-error-handling)
2. [Repository Layer](#2-repository-layer)
3. [Use Cases](#3-use-cases)
4. [Controllers](#4-controllers)
5. [Entities & DTOs](#5-entities--dtos)
6. [Timestamps](#6-timestamps)
7. [Module System](#7-module-system)
8. [Logging](#8-logging)
9. [Directory Structure](#9-directory-structure)
10. [Telegram Bot](#10-telegram-bot)
11. [Validation](#11-validation)

---

## 1. Error Handling

### Правило: Result Pattern в Application Layer

Все Use Cases должны возвращать `Result<T>`, а не бросать исключения.

```typescript
// ✅ ПРАВИЛЬНО
import { Result, ResultHelper } from '../../shared/domain/types/Result';
import { ValidationError, NotFoundError } from '../../shared/domain/errors/AppError';

class CreateBudgetUseCase {
  async execute(input: CreateBudgetInput): Promise<Result<Budget>> {
    // Валидация
    if (!input.name?.trim()) {
      return ResultHelper.failure(new ValidationError('Name is required'));
    }

    // Бизнес-логика
    const budget = await this.repository.create(input);
    return ResultHelper.success(budget);
  }
}
```

```typescript
// ❌ НЕПРАВИЛЬНО - throw в Application layer
class CreateBudgetUseCase {
  async execute(input: CreateBudgetInput): Promise<Budget> {
    if (!input.name) {
      throw new Error('Name is required');  // НЕТ!
    }
    return await this.repository.create(input);
  }
}
```

### Где throw разрешён

| Слой | Throw | Result |
|------|-------|--------|
| Domain | ❌ | ❌ (чистые данные) |
| Application (Use Cases) | ❌ | ✅ |
| Infrastructure (Repositories) | ✅ | ❌ |
| Infrastructure (External Services) | ✅ | ❌ |
| Presentation (Controllers) | ❌ | Обрабатывает Result |

### Типы ошибок

Используй классы из `src/shared/domain/errors/AppError.ts`:

```typescript
// Доступные типы ошибок
ValidationError    // 400 - невалидные данные
NotFoundError      // 404 - ресурс не найден
AuthorizationError // 403 - нет доступа
BusinessLogicError // 400 - бизнес-правило нарушено
ExternalServiceError // 502 - внешний сервис недоступен
RateLimitError     // 429 - превышен лимит

// Использование
return ResultHelper.failure(new ValidationError('Email is invalid'));
return ResultHelper.failure(new NotFoundError('Budget', budgetId));
```

---

## 2. Repository Layer

### Именование методов

| Операция | Метод | Return Type | Пример |
|----------|-------|-------------|--------|
| Create | `create(data)` | `Promise<Entity>` | `create(budgetData): Promise<Budget>` |
| Read by ID | `findById(id)` | `Promise<Entity \| null>` | `findById(id): Promise<Budget \| null>` |
| Read by user | `findByUserId(userId)` | `Promise<Entity[]>` | `findByUserId(userId): Promise<Budget[]>` |
| Read with filter | `findBy{Field}(value)` | `Promise<Entity[]>` | `findByType(type): Promise<Debt[]>` |
| Update | `update(id, data)` | `Promise<Entity>` | `update(id, data): Promise<Budget>` |
| Delete | `delete(id)` | `Promise<void>` | `delete(id): Promise<void>` |

```typescript
// ✅ ПРАВИЛЬНО
interface BudgetRepository {
  create(data: CreateBudgetInput): Promise<Budget>;
  findById(id: string): Promise<Budget | null>;
  findByUserId(userId: string): Promise<Budget[]>;
  update(id: string, data: UpdateBudgetInput): Promise<Budget>;
  delete(id: string): Promise<void>;
}
```

```typescript
// ❌ НЕПРАВИЛЬНО
interface BudgetRepository {
  save(data): Promise<string>;        // Должно быть create() → Entity
  getById(id): Promise<Budget>;       // Должно быть findById()
  getBudgetsByUser(userId): Promise<Budget[]>; // Должно быть findByUserId()
}
```

### Return Types

- `create()` всегда возвращает **полную Entity**, не только ID
- `findById()` возвращает `Entity | null`, не бросает ошибку если не найдено
- `update()` возвращает **обновлённую Entity**

### Error Handling в Repositories

```typescript
// ✅ ПРАВИЛЬНО - throw с понятным сообщением
async create(data: CreateBudgetInput): Promise<Budget> {
  try {
    const result = await this.db.insert(data);
    return this.mapToEntity(result);
  } catch (error) {
    throw new Error(`Failed to create budget: ${(error as Error).message}`);
  }
}

// Для Supabase - проверяй error codes
if (error?.code === 'PGRST116') {
  return null;  // Not found - это не ошибка
}
```

---

## 3. Use Cases

### Правило: Один execute(), один DTO параметр

```typescript
// ✅ ПРАВИЛЬНО
class CreateBudgetUseCase {
  constructor(private repository: BudgetRepository) {}

  async execute(input: CreateBudgetInput): Promise<Result<Budget>> {
    // логика
  }
}
```

```typescript
// ❌ НЕПРАВИЛЬНО - несколько методов
class GetBudgetsUseCase {
  executeGetAll(userId: string) { }
  executeGetById(id: string) { }
  executeGetActive(userId: string) { }
}

// ❌ НЕПРАВИЛЬНО - отдельные параметры
async execute(text: string, userId: string, userName?: string) { }
```

### Если нужно несколько операций

Создай отдельные Use Cases:

```typescript
// ✅ ПРАВИЛЬНО - отдельные классы
class GetBudgetByIdUseCase {
  async execute(input: { budgetId: string }): Promise<Result<Budget>> { }
}

class GetActiveBudgetsUseCase {
  async execute(input: { userId: string }): Promise<Result<Budget[]>> { }
}

class GetBudgetSummaryUseCase {
  async execute(input: { userId: string }): Promise<Result<BudgetSummary>> { }
}
```

### Допустимые исключения (Legacy)

**Query Use Cases** могут объединять несколько read-only методов, если:
- Все методы - read-only (не изменяют состояние)
- Логически связаны одной entity
- Нет side effects

```typescript
// ⚠️ ДОПУСТИМО для legacy code (не рекомендуется для нового кода)
class GetDebtsUseCase {
  async executeGetAll(userId: string, status?: DebtStatus): Promise<Result<Debt[]>> { }
  async executeGetById(debtId: string): Promise<Result<Debt | null>> { }
  async executeGetWithPayments(debtId: string): Promise<Result<DebtWithPayments | null>> { }
  async executeGetSummary(userId: string): Promise<Result<DebtSummary>> { }
}
```

При создании **нового кода** - используй отдельные Use Cases.

### Input/Output Types

```typescript
// Input - всегда объект
interface CreateBudgetInput {
  userId: string;
  name: string;
  amount: number;
  categoryIds?: string[];
}

// Output - через Result
Promise<Result<Budget>>
Promise<Result<Budget[]>>
Promise<Result<void>>  // для delete операций
```

### Dependency Injection

Все зависимости через конструктор:

```typescript
// ✅ ПРАВИЛЬНО
class CreateDebtUseCase {
  constructor(
    private debtRepository: DebtRepository,
    private transactionRepository: TransactionRepository,
    private subscriptionModule?: SubscriptionModule
  ) {}
}

// ❌ НЕПРАВИЛЬНО - setter injection
class CreateTransactionUseCase {
  private subscriptionModule?: SubscriptionModule;

  setSubscriptionDependencies(module: SubscriptionModule) {
    this.subscriptionModule = module;  // Антипаттерн!
  }
}
```

---

## 4. Controllers

### Response Format

Всегда используй helpers из `src/shared/infrastructure/utils/controllerHelpers.ts`:

```typescript
import { handleControllerSuccess, handleControllerError } from '../../../shared/infrastructure/utils/controllerHelpers';

// ✅ ПРАВИЛЬНО
async createBudget(req: Request, res: Response) {
  try {
    const result = await this.createBudgetUseCase.execute(req.body);

    if (!result.success) {
      return handleControllerError(result.error, res);
    }

    return handleControllerSuccess(result.data, res, 201, 'Budget created successfully');
  } catch (error) {
    return handleControllerError(error, res);
  }
}
```

```typescript
// ❌ НЕПРАВИЛЬНО - прямой res.json()
res.json({ success: true, data: budget });
res.status(400).json({ error: 'Invalid data' });
```

### HTTP Status Codes

| Операция | Success Code | Описание |
|----------|-------------|----------|
| POST (create resource) | `201` | Created |
| POST (action/process) | `200` | OK |
| GET | `200` | OK |
| PUT/PATCH | `200` | OK |
| DELETE | `200` | OK |

| Ошибка | Code | Когда |
|--------|------|-------|
| Validation | `400` | Невалидные данные |
| Authorization | `403` | Нет доступа |
| Not Found | `404` | Ресурс не найден |
| Rate Limit | `429` | Превышен лимит |
| Server Error | `500` | Внутренняя ошибка |

### Controller Structure

Используй **класс**, не функцию-фабрику:

```typescript
// ✅ ПРАВИЛЬНО
export class BudgetController {
  constructor(private budgetModule: BudgetModule) {}

  createBudget = async (req: Request, res: Response) => {
    // ...
  };

  getBudgets = async (req: Request, res: Response) => {
    // ...
  };
}

// Регистрация routes в отдельном файле
export function createBudgetRoutes(controller: BudgetController): Router {
  const router = Router();
  router.post('/', controller.createBudget);
  router.get('/:userId', controller.getBudgets);
  return router;
}
```

```typescript
// ❌ НЕПРАВИЛЬНО - inline handlers
export function createBudgetRouter(module: BudgetModule): Router {
  const router = Router();
  router.post('/', async (req, res) => {
    // inline логика
  });
  return router;
}
```

### User ID Resolution

Всегда используй `req.resolvedUser?.id`:

```typescript
// ✅ ПРАВИЛЬНО
const userId = req.resolvedUser?.id;
if (!userId) {
  return handleControllerError(new ValidationError('userId is required'), res);
}
```

---

## 5. Entities & DTOs

### Entity Naming

| Тип | Naming | Пример |
|-----|--------|--------|
| Domain Entity | Без суффикса | `Transaction`, `Budget`, `Debt`, `User` |
| Input DTO | `Create*Input`, `Update*Input` | `CreateBudgetInput`, `UpdateDebtInput` |
| Output DTO | `*Output` или `*Response` | `BudgetSummaryOutput` |

```typescript
// ✅ ПРАВИЛЬНО
interface Budget {
  id: string;
  userId: string;
  name: string;
  amount: number;
}

interface CreateBudgetInput {
  userId: string;
  name: string;
  amount: number;
}
```

```typescript
// ❌ НЕПРАВИЛЬНО
interface BudgetEntity { }      // Не нужен суффикс Entity
interface CreateBudgetData { }  // Должно быть Input
interface CreateBudgetDTO { }   // Должно быть Input
```

### Entity Style

Всегда используй `interface`, не `class`:

```typescript
// ✅ ПРАВИЛЬНО
interface Transaction {
  id: string;
  amount: number;
  category: string;
  createdAt: Date;
}
```

```typescript
// ❌ НЕПРАВИЛЬНО - class с методами
class OpenAIUsageEntity {
  constructor(
    public readonly id: string,
    public readonly amount: number
  ) {}

  getSummary() { }  // Методы не должны быть в Entity
}
```

### Repository Interface Naming

Без `I` prefix (TypeScript convention):

```typescript
// ✅ ПРАВИЛЬНО
interface TransactionRepository { }
interface BudgetRepository { }

// ❌ НЕПРАВИЛЬНО
interface ITransactionRepository { }
```

---

## 6. Timestamps

### Правило: Date в Domain, ISO string в API

```typescript
// Domain Entity - всегда Date
interface Transaction {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// Repository mapping
private mapToEntity(row: DbRow): Transaction {
  return {
    id: row.id,
    createdAt: new Date(row.created_at),  // ✅ Конвертируем в Date
    updatedAt: new Date(row.updated_at),
  };
}
```

```typescript
// ❌ НЕПРАВИЛЬНО - string в Entity
interface Transaction {
  createdAt: string;  // Должно быть Date
  updatedAt?: string;
}
```

### Business Dates vs System Timestamps

| Тип | Формат | Пример |
|-----|--------|--------|
| System timestamps | `Date` | `createdAt`, `updatedAt` |
| Business dates | `string` (YYYY-MM-DD) | `date`, `startDate`, `dueDate` |

```typescript
interface Transaction {
  date: string;        // YYYY-MM-DD (бизнес-дата)
  createdAt: Date;     // Системный timestamp
}

interface Budget {
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  createdAt: Date;
}
```

---

## 7. Module System

### Factory Method Pattern

Все модули должны иметь `static create()`:

```typescript
// ✅ ПРАВИЛЬНО
export class BudgetModule {
  private constructor(
    private repository: BudgetRepository,
    private transactionModule: TransactionModule
  ) {}

  static create(transactionModule: TransactionModule): BudgetModule {
    const repository = RepositoryFactory.createBudgetRepository();
    return new BudgetModule(repository, transactionModule);
  }

  getCreateBudgetUseCase(): CreateBudgetUseCase {
    return new CreateBudgetUseCase(this.repository);
  }
}
```

```typescript
// ❌ НЕПРАВИЛЬНО - функция вместо класса
export function createOpenAIUsageModule() {
  return { useCase, controller, routes };
}

// ❌ НЕПРАВИЛЬНО - ad-hoc создание в routes
const service = new DashboardService(analyticsService, budgetService);
```

### Encapsulation

Используй getters, не публичные поля:

```typescript
// ✅ ПРАВИЛЬНО
export class BudgetModule {
  private readonly _budgetService: BudgetService;

  getBudgetService(): BudgetService {
    return this._budgetService;
  }
}

// ❌ НЕПРАВИЛЬНО
export class BudgetModule {
  readonly budgetService: BudgetService;  // Публичное поле
}
```

### Dependency Injection

Все зависимости через конструктор, не через setters:

```typescript
// ✅ ПРАВИЛЬНО
const transactionModule = TransactionModule.create(subscriptionModule, userModule);

// ❌ НЕПРАВИЛЬНО - отложенная инъекция
const transactionModule = TransactionModule.create();
transactionModule.setSubscriptionDependencies(subscriptionModule, userModule);
```

---

## 8. Logging

### Создание Logger

```typescript
import { createLogger, LogCategory } from '../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TRANSACTION);
```

### Log Categories

| Category | Когда использовать |
|----------|-------------------|
| `SYSTEM` | Startup, shutdown, config |
| `AUTH` | Authentication, authorization |
| `RATE_LIMIT` | Rate limiting events |
| `TRANSACTION` | Transaction operations |
| `DEBT` | Debt operations |
| `BUDGET` | Budget operations |
| `OPENAI` | OpenAI API calls |
| `TELEGRAM` | Telegram bot (все handlers) |
| `HTTP` | HTTP requests/responses |
| `LEARNING` | ML/pattern learning |

### Logging Format

Всегда с контекстом:

```typescript
// ✅ ПРАВИЛЬНО
logger.info('Transaction created', { transactionId, userId, amount });
logger.error('Failed to create transaction', error, { userId, input });
logger.warn('Budget limit approaching', { budgetId, spent, limit });

// ❌ НЕПРАВИЛЬНО - без контекста
logger.error('Error', error);
logger.info('Created');
```

### Что логировать

| Уровень | Когда |
|---------|-------|
| `error` | Ошибки, требующие внимания |
| `warn` | Потенциальные проблемы (лимиты, deprecated) |
| `info` | Важные бизнес-события (create, delete) |
| `debug` | Детали для отладки |

---

## 9. Directory Structure

### Module Structure

```
src/modules/{module}/
├── domain/
│   ├── {entity}.ts              # Entity interface
│   ├── {entity}Repository.ts    # Repository interface
│   └── errors.ts                # Domain-specific errors (опционально)
├── application/
│   ├── create{Entity}.ts        # CreateUseCase
│   ├── update{Entity}.ts        # UpdateUseCase
│   ├── delete{Entity}.ts        # DeleteUseCase
│   ├── get{Entity}ById.ts       # GetByIdUseCase
│   ├── get{Entity}s.ts          # GetAllUseCase
│   └── {entity}Service.ts       # Service (если нужна сложная логика)
├── infrastructure/
│   ├── Sqlite{Entity}Repository.ts
│   └── Supabase{Entity}Repository.ts
├── presentation/
│   ├── {entity}Controller.ts
│   └── {entity}Routes.ts
└── {module}Module.ts
```

### File Naming

| Тип | Naming | Пример |
|-----|--------|--------|
| Entity | camelCase | `transaction.ts`, `budget.ts` |
| Repository Interface | camelCase + Repository | `transactionRepository.ts` |
| Repository Impl | PascalCase | `SqliteTransactionRepository.ts` |
| Use Case | camelCase | `createTransaction.ts` |
| Controller | camelCase + Controller | `transactionController.ts` |
| Module | camelCase + Module | `transactionModule.ts` |

---

## 10. Telegram Bot

### LogCategory

Все Telegram handlers используют `LogCategory.TELEGRAM`:

```typescript
// ✅ ПРАВИЛЬНО
const logger = createLogger(LogCategory.TELEGRAM);

// ❌ НЕПРАВИЛЬНО
const logger = createLogger(LogCategory.TELEGRAM_MSG);  // Не использовать
```

### Parse Mode

Всегда `HTML`:

```typescript
// ✅ ПРАВИЛЬНО
await ctx.reply(message, { parse_mode: 'HTML' });

// ❌ НЕПРАВИЛЬНО
await ctx.reply(message, { parse_mode: 'Markdown' });
```

### User ID Resolution

Используй единую функцию `resolveUserIdToUUID()`:

```typescript
import { resolveUserIdToUUID } from '../../shared/application/helpers/userIdResolver';

// ✅ ПРАВИЛЬНО
const userId = await resolveUserIdToUUID(telegramId, userModule);

// ❌ НЕПРАВИЛЬНО - своя реализация
async function getUserId(ctx: BotContext): Promise<string> {
  const user = await ctx.modules.userModule.getGetOrCreateUserUseCase().execute({...});
  return user.id;
}
```

### State Management

Не храни state в памяти, используй session или БД:

```typescript
// ❌ НЕПРАВИЛЬНО - memory leak
const lastTransactions: Record<string, string> = {};

// ✅ ПРАВИЛЬНО - session
ctx.session.lastTransactionId = transactionId;
```

### Error Handling

Логируй с контекстом:

```typescript
// ✅ ПРАВИЛЬНО
logger.error('Voice processing failed', error, {
  userId: ctx.from?.id,
  fileSize: file.file_size,
});

// ❌ НЕПРАВИЛЬНО
logger.error('Error', error);
```

---

## 11. Validation

### Где валидировать

| Слой | Что валидируем |
|------|----------------|
| Controller | Наличие обязательных полей в request |
| Use Case | Бизнес-правила |
| Repository | Ничего (только technical errors) |

### Validation в Controller

```typescript
// Простая проверка наличия
const { userId, name, amount } = req.body;
if (!userId || !name || !amount) {
  return handleControllerError(new ValidationError('Missing required fields'), res);
}
```

### Validation в Use Case

```typescript
// Бизнес-правила
async execute(input: CreateBudgetInput): Promise<Result<Budget>> {
  if (input.amount <= 0) {
    return ResultHelper.failure(new ValidationError('Amount must be positive'));
  }

  if (input.startDate > input.endDate) {
    return ResultHelper.failure(new ValidationError('Start date must be before end date'));
  }

  // ...
}
```

### Использование Validators

Для сложной валидации используй `src/shared/application/validation/validators.ts`:

```typescript
import { Validators } from '../../shared/application/validation/validators';

const errors = [];
errors.push(...Validators.required(input.name, 'name'));
errors.push(...Validators.positiveNumber(input.amount, 'amount'));

if (errors.length > 0) {
  return ResultHelper.failure(new ValidationError(errors.join(', ')));
}
```

---

## Чеклист для Code Review

При ревью проверяй:

- [ ] Error handling через Result pattern в Use Cases
- [ ] Repository методы названы правильно (create, findById, update, delete)
- [ ] Use Case имеет один execute() с одним DTO параметром
- [ ] Controller использует handleControllerSuccess/handleControllerError
- [ ] HTTP status codes корректны (201 для POST create)
- [ ] Entity без суффикса, DTO с суффиксом Input/Output
- [ ] Timestamps как Date, не string
- [ ] Logging с контекстом
- [ ] Telegram handlers используют HTML parse mode
- [ ] Нет state в памяти (используй session/DB)

---

## Migration Plan

Существующий код будет приводиться к стандартам в следующем порядке:

1. **Error Handling** - конвертировать throw → Result в Use Cases
2. **Repository Methods** - переименовать save→create, getById→findById
3. **Use Case Signatures** - разбить multiple methods на отдельные классы
4. **Controller Responses** - заменить прямые res.json на helpers
5. **Module System** - создать DashboardModule, убрать setSubscriptionDependencies
6. **Telegram** - унифицировать handlers

---

*Последнее обновление: 2026-01-22*
