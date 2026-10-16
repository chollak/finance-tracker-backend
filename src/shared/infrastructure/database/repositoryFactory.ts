import { TransactionRepository } from '../../../modules/transaction/domain/transactionRepository';
import { BudgetRepository } from '../../../modules/budget/domain/budgetRepository';
import { UserRepository } from '../../../modules/user/domain/userRepository';
import { DebtRepository } from '../../../modules/debt/domain/debtRepository';
import { SubscriptionRepository } from '../../../modules/subscription/domain/subscriptionRepository';
import { UsageLimitRepository } from '../../../modules/subscription/domain/usageLimitRepository';
import { SqliteTransactionRepository } from '../../../modules/transaction/infrastructure/persistence/SqliteTransactionRepository';
import { SqliteBudgetRepository } from '../../../modules/budget/infrastructure/SqliteBudgetRepository';
import { SqliteUserRepository } from '../../../modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteDebtRepository } from '../../../modules/debt/infrastructure/SqliteDebtRepository';
import { SqliteSubscriptionRepository } from '../../../modules/subscription/infrastructure/SqliteSubscriptionRepository';
import { SqliteUsageLimitRepository } from '../../../modules/subscription/infrastructure/SqliteUsageLimitRepository';

/**
 * Creates repository implementations. There is one database path — TypeORM (decision Д6, FT-090);
 * the `supabase-js` repositories were removed. Modules still depend only on the domain interfaces,
 * so a Postgres data source can be added later behind the same TypeORM repositories.
 */
export class RepositoryFactory {
  static createTransactionRepository(): TransactionRepository {
    return new SqliteTransactionRepository();
  }

  static createBudgetRepository(): BudgetRepository {
    return new SqliteBudgetRepository();
  }

  static createUserRepository(): UserRepository {
    return new SqliteUserRepository();
  }

  static createDebtRepository(): DebtRepository {
    return new SqliteDebtRepository();
  }

  static createSubscriptionRepository(): SubscriptionRepository {
    return new SqliteSubscriptionRepository();
  }

  static createUsageLimitRepository(): UsageLimitRepository {
    return new SqliteUsageLimitRepository();
  }
}
