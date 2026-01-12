# Design Patterns

Проект использует набор проверенных design patterns для обеспечения maintainability, testability и flexibility.

## Используемые паттерны

### 1. Repository Pattern

**Назначение:** Абстракция доступа к данным, изоляция бизнес-логики от деталей хранения.

**Реализация:**
- Domain layer определяет `interface` репозитория
- Infrastructure layer реализует интерфейс
- Use cases работают через интерфейс, не зная о конкретной реализации

**Пример:**
```typescript
// Domain interface
interface TransactionRepository {
  save(transaction: Transaction): Promise<string>;
  getAll(): Promise<Transaction[]>;
  findById(id: string): Promise<Transaction | null>;
}

// Infrastructure implementations
class SqliteTransactionRepository implements TransactionRepository { }
class SupabaseTransactionRepository implements TransactionRepository { }

// Use case использует интерфейс
class CreateTransactionUseCase {
  constructor(private repository: TransactionRepository) {}

  async execute(data) {
    return this.repository.save(data);
  }
}
```

**Преимущества:**
- ✅ Легко переключаться между SQLite и Supabase
- ✅ Тестируемость (легко мокировать)
- ✅ Бизнес-логика не зависит от деталей БД

**Где используется:**
- `TransactionRepository` - [`src/modules/transaction/domain/transactionRepository.ts`](../../../src/modules/transaction/domain/transactionRepository.ts)
- `BudgetRepository` - [`src/modules/budget/domain/budgetRepository.ts`](../../../src/modules/budget/domain/budgetRepository.ts)

---

### 2. Dependency Injection

**Назначение:** Передача зависимостей извне через конструктор, а не создание их внутри класса.

**Реализация:**
```typescript
class BudgetService {
  constructor(
    private budgetRepository: BudgetRepository,
    private transactionRepository: TransactionRepository
  ) {}
}

// Создание с инъекцией
const budgetService = new BudgetService(budgetRepo, transactionRepo);
```

**Преимущества:**
- ✅ Testability - можно передать mock объекты
- ✅ Flexibility - можно менять реализации
- ✅ Explicit Dependencies - видны все зависимости
- ✅ Single Responsibility - класс не отвечает за создание зависимостей

**Где используется:**
- Все Use Cases получают repository через конструктор
- Все Services получают зависимости через конструктор
- Modules получают другие модули через конструктор

---

### 3. Factory Pattern

**Назначение:** Централизованное создание объектов с инкапсуляцией логики выбора реализации.

**Реализация:**
```typescript
class RepositoryFactory {
  static createTransactionRepository(): TransactionRepository {
    if (AppConfig.DATABASE_TYPE === 'supabase') {
      return new SupabaseTransactionRepository();
    }
    return new SqliteTransactionRepository();
  }
}

// Использование
const repository = RepositoryFactory.createTransactionRepository();
```

**Преимущества:**
- ✅ Централизованная логика выбора
- ✅ Легко добавить новую реализацию
- ✅ Клиенты не зависят от конкретных классов

**Где используется:**
- `RepositoryFactory` - [`src/shared/infrastructure/database/repositoryFactory.ts`](../../../src/shared/infrastructure/database/repositoryFactory.ts)
- `ErrorFactory` - [`src/shared/domain/errors/ErrorFactory.ts`](../../../src/shared/domain/errors/ErrorFactory.ts)

---

### 4. Use Case Pattern

**Назначение:** Инкапсуляция одной бизнес-операции в отдельный класс.

**Реализация:**
```typescript
class CreateTransactionUseCase {
  constructor(private repository: TransactionRepository) {}

  async execute(data: CreateTransactionData): Promise<Result<Transaction>> {
    // Валидация
    // Бизнес-логика
    // Сохранение
    const id = await this.repository.save(data);
    return Result.success(id);
  }
}
```

**Принципы:**
- Один use case = одна бизнес-операция
- Метод `execute()` для выполнения
- Зависимости через конструктор
- Возвращает `Result<T>` для безопасной обработки ошибок

**Преимущества:**
- ✅ Single Responsibility
- ✅ Легко тестировать
- ✅ Переиспользуемость
- ✅ Явная бизнес-логика

**Где используется:**
- `CreateTransactionUseCase`, `GetTransactionsUseCase`, etc.
- `CreateBudgetUseCase`, `UpdateBudgetUseCase`, etc.
- `ProcessVoiceInputUseCase`, `ProcessTextInputUseCase`

---

### 5. Result Pattern

**Назначение:** Безопасная обработка ошибок без exceptions, явное представление успеха/неудачи.

**Реализация:**
```typescript
type Result<T, E = Error> = Success<T> | Failure<E>;

interface Success<T> {
  success: true;
  data: T;
}

interface Failure<E> {
  success: false;
  error: E;
}

// Использование
const result = await useCase.execute(data);

if (result.success) {
  console.log(result.data); // type-safe
} else {
  console.error(result.error); // type-safe
}
```

**Преимущества:**
- ✅ Type-safe обработка ошибок
- ✅ Явное указание возможности ошибки
- ✅ Функциональный подход
- ✅ Нет скрытых exceptions

**Helpers:**
```typescript
Result.success(data)
Result.failure(error)
Result.map(fn)
Result.flatMap(fn)
Result.fromPromise(promise)
```

**Где используется:**
- [`src/shared/domain/types/Result.ts`](../../../src/shared/domain/types/Result.ts)
- Все use cases возвращают `Result<T>`

---

### 6. Module Pattern

**Назначение:** Группировка связанной функциональности в самодостаточные модули.

**Реализация:**
```typescript
class TransactionModule {
  private repository: TransactionRepository;
  private createUseCase: CreateTransactionUseCase;

  constructor() {
    this.repository = RepositoryFactory.createTransactionRepository();
    this.createUseCase = new CreateTransactionUseCase(this.repository);
  }

  static create(): TransactionModule {
    return new TransactionModule();
  }

  getCreateTransactionUseCase() { return this.createUseCase; }
  getRepository() { return this.repository; }
}
```

**Преимущества:**
- ✅ High Cohesion - связанный код вместе
- ✅ Low Coupling - слабая связь между модулями
- ✅ Encapsulation - внутренние детали скрыты
- ✅ Reusability - модули переиспользуемы

**Где используется:**
- `TransactionModule`, `BudgetModule`, `VoiceProcessingModule`, etc.

---

### 7. Strategy Pattern (через Factory)

**Назначение:** Выбор алгоритма/реализации во время выполнения.

**Реализация:**
```typescript
// Две стратегии работы с БД
class SqliteTransactionRepository { }
class SupabaseTransactionRepository { }

// Выбор стратегии через конфигурацию
const repository = DATABASE_TYPE === 'supabase'
  ? new SupabaseTransactionRepository()
  : new SqliteTransactionRepository();
```

**Где используется:**
- Выбор database implementation (SQLite vs Supabase)
- Repository Factory

---

### 8. Singleton Pattern (ограниченное использование)

**Назначение:** Гарантия единственного экземпляра класса.

**Где используется:**
- `Supabase Client` - [`src/shared/infrastructure/database/supabase.config.ts`](../../../src/shared/infrastructure/database/supabase.config.ts)
- `TransactionLearningService` - [`src/shared/application/learning/transactionLearning.ts`](../../../src/shared/application/learning/transactionLearning.ts)

**Примечание:** Используется минимально, предпочтение отдается DI.

---

## Паттерны обработки ошибок

### Error Hierarchy

```typescript
abstract class AppError extends Error {
  abstract code: string;
  abstract statusCode: number;
}

class ValidationError extends AppError { }
class NotFoundError extends AppError { }
class ExternalServiceError extends AppError { }
```

**Где используется:**
- [`src/shared/domain/errors/AppError.ts`](../../../src/shared/domain/errors/AppError.ts)

### Error Middleware Pattern

Централизованная обработка ошибок в Express:

```typescript
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  // Handle unknown errors
}
```

**Где:** [`src/delivery/web/express/middleware/errorMiddleware.ts`](../../../src/delivery/web/express/middleware/errorMiddleware.ts)

---

## SOLID Principles

### Single Responsibility
- Каждый Use Case отвечает за одну операцию
- Каждый Repository за один entity type

### Open/Closed
- Легко добавить новую реализацию Repository
- Легко добавить новый Use Case

### Liskov Substitution
- Любая реализация `TransactionRepository` взаимозаменяема

### Interface Segregation
- Маленькие, специализированные interfaces

### Dependency Inversion
- High-level (Use Cases) зависят от абстракций (interfaces)
- Low-level (Repositories) реализуют абстракции

---

## См. также

- [Overview](overview.md) - Clean Architecture layers
- [Modules](modules.md) - Модульная структура
- [Adding Features](../08-development/adding-features.md) - Применение паттернов на практике
