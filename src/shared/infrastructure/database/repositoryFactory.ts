import { TransactionRepository } from '../../../modules/transaction/domain/transactionRepository';
import { BudgetRepository } from '../../../modules/budget/domain/budgetRepository';
import { UserRepository } from '../../../modules/user/domain/userRepository';
import { UserSettingsRepository } from '../../../modules/user/domain/userSettingsRepository';
import { DebtRepository } from '../../../modules/debt/domain/debtRepository';
import { SubscriptionRepository } from '../../../modules/subscription/domain/subscriptionRepository';
import { UsageLimitRepository } from '../../../modules/subscription/domain/usageLimitRepository';
import { CategoryRepository } from '../../../modules/category/domain/categoryRepository';
import { SqliteCategoryRepository } from '../../../modules/category/infrastructure/SqliteCategoryRepository';
import { AccountRepository } from '../../../modules/account/domain/accountRepository';
import { SqliteAccountRepository } from '../../../modules/account/infrastructure/SqliteAccountRepository';
import { SqliteTransactionRepository } from '../../../modules/transaction/infrastructure/persistence/SqliteTransactionRepository';
import { SqliteBudgetRepository } from '../../../modules/budget/infrastructure/SqliteBudgetRepository';
import { SqliteUserRepository } from '../../../modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../../../modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
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

  static createUserSettingsRepository(): UserSettingsRepository {
    return new SqliteUserSettingsRepository();
  }

  static createDebtRepository(): DebtRepository {
    return new SqliteDebtRepository();
  }

  static createSubscriptionRepository(): SubscriptionRepository {
    return new SqliteSubscriptionRepository();
  }

  static createCategoryRepository(): CategoryRepository {
    return new SqliteCategoryRepository();
  }

  static createAccountRepository(): AccountRepository {
    return new SqliteAccountRepository();
  }

  static createUsageLimitRepository(): UsageLimitRepository {
    return new SqliteUsageLimitRepository();
  }
}
