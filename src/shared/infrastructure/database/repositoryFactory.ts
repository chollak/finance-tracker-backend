import { AppConfig } from '../config/appConfig';
import { TransactionRepository } from '../../../modules/transaction/domain/transactionRepository';
import { BudgetRepository } from '../../../modules/budget/domain/budgetRepository';
import { UserRepository } from '../../../modules/user/domain/userRepository';
import { SqliteTransactionRepository } from '../../../modules/transaction/infrastructure/persistence/SqliteTransactionRepository';
import { SupabaseTransactionRepository } from '../../../modules/transaction/infrastructure/persistence/SupabaseTransactionRepository';
import { SqliteBudgetRepository } from '../../../modules/budget/infrastructure/sqliteBudgetRepository';
import { SupabaseBudgetRepository } from '../../../modules/budget/infrastructure/SupabaseBudgetRepository';
import { SqliteUserRepository } from '../../../modules/user/infrastructure/persistence/SqliteUserRepository';
import { SupabaseUserRepository } from '../../../modules/user/infrastructure/persistence/SupabaseUserRepository';

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
}