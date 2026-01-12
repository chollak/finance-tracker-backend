# Budget Calculation Flow

Как BudgetModule рассчитывает потраченную сумму (spent) используя TransactionModule.

## Проблема

Budget entity хранит:
- `amount` - лимит бюджета (например, 50000)
- `spent` - сколько потрачено (calculated field)
- `period` - период (monthly, weekly, etc.)
- `startDate`, `endDate` - временной диапазон

**Вопрос:** Как рассчитать `spent`?

**Ответ:** Суммировать транзакции пользователя в периоде бюджета через `TransactionRepository`.

---

## Dependency Between Modules

```
BudgetModule
    ↓ depends on
TransactionModule
    ↓ provides
TransactionRepository.getByUserIdAndDateRange()
```

**Файл:** [`src/modules/budget/budgetModule.ts:10`](../../../src/modules/budget/budgetModule.ts)

```typescript
constructor(transactionModule: TransactionModule) {
  this.repository = RepositoryFactory.createBudgetRepository();
  this.budgetService = new BudgetService(
    this.repository,
    transactionModule.getRepository() // ← Cross-module dependency
  );
}
```

---

## Calculation Flow

### 1. User Requests Budget Summary

**API Call:**
```http
GET /api/budgets/users/131184740/budgets/summaries
```

---

### 2. Controller → Use Case

**Controller:** `BudgetController.getBudgetSummaries()`

```typescript
const summaries = await getBudgetsUseCase.execute(userId);
```

---

### 3. Use Case → Budget Service

**Use Case:** `GetBudgetsUseCase`

```typescript
async execute(userId: string) {
  const budgets = await this.budgetRepository.getByUserId(userId);

  // Recalculate spent for all budgets
  await this.budgetService.recalculateAllUserBudgets(userId);

  // Get summaries
  return await this.budgetService.getBudgetSummaries(userId);
}
```

---

### 4. Budget Service → Transaction Repository

**Service:** `BudgetService.recalculateBudgetSpending()`

**Файл:** [`src/modules/budget/application/budgetService.ts:58`](../../../src/modules/budget/application/budgetService.ts)

```typescript
async recalculateBudgetSpending(budgetId: string): Promise<void> {
  // 1. Get budget
  const budget = await this.budgetRepository.getById(budgetId);

  // 2. Query transactions in budget period
  const transactions = await this.transactionRepository.getByUserIdAndDateRange(
    budget.userId,
    new Date(budget.startDate),
    new Date(budget.endDate)
  );

  // 3. Filter by budget categories (if specified)
  let relevantTransactions = transactions.filter(t => t.type === 'expense');

  if (budget.categoryIds && budget.categoryIds.length > 0) {
    relevantTransactions = relevantTransactions.filter(t =>
      budget.categoryIds.includes(t.category)
    );
  }

  // 4. Calculate total spent
  const spent = relevantTransactions.reduce((sum, t) => sum + t.amount, 0);

  // 5. Update budget
  await this.budgetRepository.updateSpentAmount(budgetId, spent);
}
```

---

## Calculation Logic

### A. Time Range Filtering

```typescript
const transactions = await transactionRepository.getByUserIdAndDateRange(
  userId,
  startDate, // 2026-01-01
  endDate    // 2026-01-31
);
```

**SQL (SQLite):**
```sql
SELECT * FROM transactions
WHERE user_id = ?
  AND date >= ?
  AND date <= ?
  AND type = 'expense'
```

**Supabase:**
```typescript
await supabase
  .from('transactions')
  .select('*')
  .eq('user_id', userId)
  .gte('date', startDate)
  .lte('date', endDate)
  .eq('type', 'expense');
```

---

### B. Category Filtering (Optional)

Если budget привязан к определенным категориям:

```typescript
if (budget.categoryIds && budget.categoryIds.length > 0) {
  relevantTransactions = transactions.filter(t =>
    budget.categoryIds.includes(t.category)
  );
}
```

**Example:**
- Budget: `categoryIds = ["Продукты", "Кафе"]`
- Только транзакции с этими категориями учитываются

---

### C. Sum Calculation

```typescript
const spent = relevantTransactions.reduce(
  (sum, transaction) => sum + transaction.amount,
  0
);
```

**Example:**
```
Transaction 1: 500 (Продукты)
Transaction 2: 300 (Продукты)
Transaction 3: 1000 (Кафе)
---------------
Total spent: 1800
```

---

### D. Update Budget

```typescript
await budgetRepository.updateSpentAmount(budgetId, spent);
```

**SQLite:**
```sql
UPDATE budgets
SET spent = ?, updated_at = NOW()
WHERE id = ?
```

**Supabase:**
```typescript
await supabase
  .from('budgets')
  .update({ spent, updated_at: new Date() })
  .eq('id', budgetId);
```

---

## Budget Summary Calculation

**Service:** `BudgetService.getBudgetSummary()`

После обновления `spent`, рассчитываются дополнительные метрики:

```typescript
interface BudgetSummary {
  id: string;
  name: string;
  amount: number;          // Лимит
  spent: number;           // Потрачено
  remaining: number;       // amount - spent
  percentageUsed: number;  // (spent / amount) * 100
  isOverBudget: boolean;   // spent > amount
  period: BudgetPeriod;
  daysRemaining: number;   // days until endDate
}
```

**Calculations:**
```typescript
const remaining = budget.amount - budget.spent;
const percentageUsed = (budget.spent / budget.amount) * 100;
const isOverBudget = budget.spent > budget.amount;

const now = new Date();
const endDate = new Date(budget.endDate);
const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
```

---

## Budget Alerts

**Service:** `BudgetService.getBudgetsNearLimit()`

```typescript
async getBudgetsNearLimit(
  userId: string,
  threshold: number = 0.8 // 80% по умолчанию
): Promise<BudgetEntity[]> {
  const summaries = await this.getBudgetSummaries(userId);

  return summaries.filter(s =>
    s.percentageUsed >= (threshold * 100) && !s.isOverBudget
  );
}
```

**Example:**
- Budget limit: 50000
- Spent: 42000
- Percentage: 84%
- Alert: ⚠️ Near limit (threshold 80%)

---

## When Recalculation Happens

### 1. On Budget Request
```typescript
// GET /api/budgets/users/:userId/budgets/summaries
await budgetService.recalculateAllUserBudgets(userId);
```

### 2. Manual Recalculation
```typescript
// POST /api/budgets/budgets/:budgetId/recalculate
await budgetService.recalculateBudgetSpending(budgetId);
```

### 3. On Dashboard Load
```typescript
// GET /api/dashboard/:userId
// DashboardService internally calls recalculation
```

---

## Performance Considerations

### Potential Bottleneck
- Recalculation на каждый запрос может быть медленным
- Большое количество транзакций = slow query

### Optimizations

**1. Caching:**
```typescript
// Cache budget summaries for 5 minutes
const cacheKey = `budget_summary_${userId}`;
const cached = cache.get(cacheKey);
if (cached) return cached;
```

**2. Database Indexes:**
```sql
CREATE INDEX idx_transactions_user_date
ON transactions(user_id, date DESC);
```

**3. Incremental Updates:**
- При создании транзакции: `spent += transaction.amount`
- При удалении: `spent -= transaction.amount`
- Вместо полного пересчета

**4. Background Jobs:**
- Cron job пересчитывает spent каждые 10 минут
- API возвращает cached values

---

## Edge Cases

### 1. Budget Without Categories
```typescript
if (!budget.categoryIds || budget.categoryIds.length === 0) {
  // Все expense транзакции учитываются
  relevantTransactions = transactions.filter(t => t.type === 'expense');
}
```

### 2. Overlapping Budgets
- У пользователя может быть несколько бюджетов на одну категорию
- Каждый бюджет рассчитывается независимо
- Одна транзакция может влиять на несколько бюджетов

### 3. Budget Period Expired
```typescript
if (new Date() > new Date(budget.endDate)) {
  // Budget истек, но spent остается для истории
  // isActive = false
}
```

### 4. No Transactions in Period
```typescript
if (transactions.length === 0) {
  spent = 0; // Ничего не потрачено
}
```

---

## Example Scenario

**User Setup:**
- Budget: "Groceries" (Продукты)
- Amount: 30000
- Period: monthly (2026-01-01 to 2026-01-31)
- CategoryIds: ["Продукты"]

**Transactions:**
```
2026-01-05: 5000 (Продукты)
2026-01-10: 3500 (Продукты)
2026-01-15: 2000 (Кафе) ← Not counted (different category)
2026-01-20: 7500 (Продукты)
```

**Calculation:**
```
spent = 5000 + 3500 + 7500 = 16000
remaining = 30000 - 16000 = 14000
percentageUsed = (16000 / 30000) * 100 = 53.3%
isOverBudget = false
```

**API Response:**
```json
{
  "id": "budget-123",
  "name": "Groceries",
  "amount": 30000,
  "spent": 16000,
  "remaining": 14000,
  "percentageUsed": 53.3,
  "isOverBudget": false,
  "daysRemaining": 11
}
```

---

## Критичные файлы

- [`src/modules/budget/application/budgetService.ts`](../../../src/modules/budget/application/budgetService.ts) - Budget calculation logic
- [`src/modules/budget/budgetModule.ts`](../../../src/modules/budget/budgetModule.ts) - Module with TransactionModule dependency
- [`src/modules/transaction/domain/transactionRepository.ts`](../../../src/modules/transaction/domain/transactionRepository.ts) - `getByUserIdAndDateRange` method

---

## См. также

- [Modules](../01-architecture/modules.md) - Module dependencies
- [API Lifecycle](api-lifecycle.md) - Request flow
- [Voice → Transaction](voice-to-transaction.md) - How transactions are created
