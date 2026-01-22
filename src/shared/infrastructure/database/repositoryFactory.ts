import { AppConfig } from '../config/appConfig';
import { TransactionRepository } from '../../../modules/transaction/domain/transactionRepository';
import { BudgetRepository } from '../../../modules/budget/domain/budgetRepository';
import { UserRepository } from '../../../modules/user/domain/userRepository';
import { DebtRepository } from '../../../modules/debt/domain/debtRepository';
import { SubscriptionRepository } from '../../../modules/subscription/domain/subscriptionRepository';
import { UsageLimitRepository } from '../../../modules/subscription/domain/usageLimitRepository';
import { SqliteTransactionRepository } from '../../../modules/transaction/infrastructure/persistence/SqliteTransactionRepository';
import { SupabaseTransactionRepository } from '../../../modules/transaction/infrastructure/persistence/SupabaseTransactionRepository';
import { SqliteBudgetRepository } from '../../../modules/budget/infrastructure/SqliteBudgetRepository';
import { SupabaseBudgetRepository } from '../../../modules/budget/infrastructure/SupabaseBudgetRepository';
import { SqliteUserRepository } from '../../../modules/user/infrastructure/persistence/SqliteUserRepository';
import { SupabaseUserRepository } from '../../../modules/user/infrastructure/persistence/SupabaseUserRepository';
import { SqliteDebtRepository } from '../../../modules/debt/infrastructure/SqliteDebtRepository';
import { SupabaseDebtRepository } from '../../../modules/debt/infrastructure/SupabaseDebtRepository';
import { SqliteSubscriptionRepository } from '../../../modules/subscription/infrastructure/SqliteSubscriptionRepository';
import { SupabaseSubscriptionRepository } from '../../../modules/subscription/infrastructure/SupabaseSubscriptionRepository';
import { SqliteUsageLimitRepository } from '../../../modules/subscription/infrastructure/SqliteUsageLimitRepository';
import { SupabaseUsageLimitRepository } from '../../../modules/subscription/infrastructure/SupabaseUsageLimitRepository';

export class RepositoryFactory {
  static createTransactionRepository(): TransactionRepository {
    if (AppConfig.DATABASE_TYPE === 'supabase') {
      return new SupabaseTransactionRepository();
    }
    return new SqliteTransactionRepository();
  }

  static createBudgetRepository(): BudgetRepository {
    if (AppConfig.DATABASE_TYPE === 'supabase') {
      return new SupabaseBudgetRepository();
    }
    return new SqliteBudgetRepository();
  }

  static createUserRepository(): UserRepository {
    if (AppConfig.DATABASE_TYPE === 'supabase') {
      return new SupabaseUserRepository();
    }
    return new SqliteUserRepository();
  }

  static createDebtRepository(): DebtRepository {
    if (AppConfig.DATABASE_TYPE === 'supabase') {
      return new SupabaseDebtRepository();
    }
    return new SqliteDebtRepository();
  }

  static createSubscriptionRepository(): SubscriptionRepository {
    if (AppConfig.DATABASE_TYPE === 'supabase') {
      return new SupabaseSubscriptionRepository();
    }
    return new SqliteSubscriptionRepository();
  }

  static createUsageLimitRepository(): UsageLimitRepository {
    if (AppConfig.DATABASE_TYPE === 'supabase') {
      return new SupabaseUsageLimitRepository();
    }
    return new SqliteUsageLimitRepository();
  }
}