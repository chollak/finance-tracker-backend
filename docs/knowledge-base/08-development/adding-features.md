# Adding Features

Практические гайды по добавлению новой функциональности в проект.

## Добавление нового Use Case

### Шаг 1: Создать Use Case Class

**Location:** `src/modules/{module}/application/{action}UseCase.ts`

**Template:**
```typescript
// src/modules/transaction/application/archiveTransactionUseCase.ts
import { Result } from '../../../shared/domain/types/Result';
import { TransactionRepository } from '../domain/transactionRepository';

export class ArchiveTransactionUseCase {
  constructor(private repository: TransactionRepository) {}

  async execute(id: string): Promise<Result<void>> {
    try {
      const transaction = await this.repository.findById(id);

      if (!transaction) {
        return Result.failure(new Error('Transaction not found'));
      }

      // Business logic here
      await this.repository.update(id, { archived: true });

      return Result.success(undefined);
    } catch (error) {
      return Result.failure(error);
    }
  }
}
```

### Шаг 2: Добавить в Module

**Location:** `src/modules/{module}/{module}Module.ts`

```typescript
export class TransactionModule {
  private archiveTransactionUseCase: ArchiveTransactionUseCase;

  constructor() {
    // ... existing use cases
    this.archiveTransactionUseCase = new ArchiveTransactionUseCase(this.repository);
  }

  getArchiveTransactionUseCase() {
    return this.archiveTransactionUseCase;
  }
}
```

### Шаг 3: Создать Controller Method

**Location:** `src/modules/{module}/presentation/{module}Controller.ts`

```typescript
export function archiveTransaction(
  archiveUseCase: ArchiveTransactionUseCase
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
const result = await archiveUseCase.execute(id);

      if (result.success) {
        return handleControllerSuccess(null, res, 200, 'Transaction archived');
      } else {
        return handleControllerError(result.error, res);
      }
    } catch (error) {
      next(error);
    }
  };
}
```

### Шаг 4: Добавить Route

**Location:** `src/delivery/web/express/routes/{module}Routes.ts`

```typescript
router.put('/:id/archive', archiveTransaction(
  transactionModule.getArchiveTransactionUseCase()
));
```

---

## Добавление нового API Endpoint

### Полный пример: DELETE /api/transactions/:id/permanently

#### 1. Use Case (если нужен новый)
```typescript
// src/modules/transaction/application/permanentlyDeleteTransactionUseCase.ts
export class PermanentlyDeleteTransactionUseCase {
  async execute(id: string): Promise<Result<void>> {
    // Business logic
  }
}
```

#### 2. Controller
```typescript
// src/modules/transaction/presentation/transactionController.ts
export function permanentlyDeleteTransaction(useCase: PermanentlyDeleteTransactionUseCase) {
  return async (req, res, next) => {
    // Implementation
  };
}
```

#### 3. Route
```typescript
// src/delivery/web/express/routes/transactionRoutes.ts
router.delete('/:id/permanently', permanentlyDeleteTransaction(
  transactionModule.getPermanentlyDeleteTransactionUseCase()
));
```

#### 4. Test
```bash
curl -X DELETE http://localhost:3000/api/transactions/123/permanently
```

---

## Добавление нового Module

### Пример: NotificationModule

#### 1. Создать структуру

```bash
mkdir -p src/modules/notification/{domain,application,infrastructure,presentation}
```

#### 2. Domain Layer

**Entity:**
```typescript
// src/modules/notification/domain/notificationEntity.ts
export interface NotificationEntity {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'alert';
  read: boolean;
  createdAt: Date;
}
```

**Repository Interface:**
```typescript
// src/modules/notification/domain/notificationRepository.ts
export interface NotificationRepository {
  create(data: CreateNotificationData): Promise<NotificationEntity>;
  getByUserId(userId: string): Promise<NotificationEntity[]>;
  markAsRead(id: string): Promise<void>;
}
```

#### 3. Application Layer

**Use Case:**
```typescript
// src/modules/notification/application/createNotificationUseCase.ts
export class CreateNotificationUseCase {
  constructor(private repository: NotificationRepository) {}

  async execute(data: CreateNotificationData): Promise<Result<NotificationEntity>> {
    // Implementation
  }
}
```

#### 4. Infrastructure Layer

**Repository Implementation:**
```typescript
// src/modules/notification/infrastructure/SqliteNotificationRepository.ts
export class SqliteNotificationRepository implements NotificationRepository {
  // Implementation
}
```

#### 5. Module Class

```typescript
// src/modules/notification/notificationModule.ts
export class NotificationModule {
  private repository: NotificationRepository;
  private createUseCase: CreateNotificationUseCase;

  constructor() {
    this.repository = new SqliteNotificationRepository();
    this.createUseCase = new CreateNotificationUseCase(this.repository);
  }

  static create(): NotificationModule {
    return new NotificationModule();
  }

  getCreateNotificationUseCase() {
    return this.createUseCase;
  }
}
```

#### 6. Добавить в appModules.ts

```typescript
// src/appModules.ts
import { NotificationModule } from './modules/notification/notificationModule';

export function createModules() {
  const transactionModule = TransactionModule.create();
  const budgetModule = BudgetModule.create(transactionModule);
  const notificationModule = NotificationModule.create(); // ← New

  return {
    transactionModule,
    budgetModule,
    notificationModule // ← New
  };
}
```

#### 7. Presentation Layer

**Controller + Routes:**
```typescript
// src/modules/notification/presentation/notificationController.ts
// src/delivery/web/express/routes/notificationRoutes.ts
```

#### 8. Register Routes

```typescript
// src/delivery/web/express/expressServer.ts
app.use('/api/notifications', notificationRoutes);
```

---

## Добавление нового Database Table

### Example: notifications table

#### 1. Create Entity (TypeORM)

```typescript
// src/shared/infrastructure/database/entities/Notification.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  userId!: string;

  @Column()
  title!: string;

  @Column('text')
  message!: string;

  @Column({ default: false })
  read!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
```

#### 2. Update database.config.ts

```typescript
// src/shared/infrastructure/database/database.config.ts
import { Notification } from './entities/Notification';

export const AppDataSource = new DataSource({
  entities: [Transaction, Budget, Notification], // ← Add here
  // ...
});
```

#### 3. Auto-sync (Development)

```bash
npm run dev
# Table automatically created
```

#### 4. Supabase Migration

```sql
-- migrations/002_notifications.sql
CREATE TABLE notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
```

Выполнить в Supabase SQL Editor.

---

## Best Practices

### Use Cases
- ✅ Один use case = одна бизнес-операция
- ✅ Возвращать `Result<T>` для type-safe error handling
- ✅ Dependency injection через конструктор
- ❌ НЕ делать HTTP calls напрямую

### Controllers
- ✅ Только валидация и маршрутизация
- ✅ Delegate бизнес-логику к use cases
- ✅ Использовать `handleControllerSuccess` / `handleControllerError`
- ❌ НЕ писать бизнес-логику в контроллерах

### Modules
- ✅ Self-contained с четкими boundaries
- ✅ Explicit dependencies через конструктор
- ✅ Factory method `create()` для инициализации
- ❌ НЕ создавать circular dependencies

### Testing
```typescript
// tests/createNotification.test.ts
describe('CreateNotificationUseCase', () => {
  it('should create notification successfully', async () => {
    const mockRepository = {
      create: jest.fn().mockResolvedValue({ id: '123', ... })
    };

    const useCase = new CreateNotificationUseCase(mockRepository as any);
    const result = await useCase.execute(data);

    expect(result.success).toBe(true);
    expect(mockRepository.create).toHaveBeenCalledWith(data);
  });
});
```

---

## Common Patterns

### Cross-Module Communication
```typescript
// BudgetModule needs TransactionModule
class BudgetModule {
  constructor(transactionModule: TransactionModule) {
    this.budgetService = new BudgetService(
      this.repository,
      transactionModule.getRepository() // ← Use getter
    );
  }
}
```

### Repository Factory Usage
```typescript
// Automatic selection based on DATABASE_TYPE
this.repository = RepositoryFactory.createTransactionRepository();
```

### Error Handling
```typescript
// Use ErrorFactory for consistent errors
throw ErrorFactory.validation('Invalid amount', { field: 'amount' });
throw ErrorFactory.notFound('Transaction', id);
```

---

## См. также

- [Architecture Patterns](../01-architecture/patterns.md) - Design patterns
- [Modules](../01-architecture/modules.md) - Module system
- [Quick Start](quick-start.md) - Development setup
