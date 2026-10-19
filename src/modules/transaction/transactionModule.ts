import { CreateTransactionUseCase } from './application/createTransaction';
import { GetTransactionHistoryUseCase } from './application/getTransactionHistory';
import { GetPeriodTotalsUseCase } from './application/getPeriodTotals';
import { GetUserTransactionsUseCase } from './application/getUserTransactions';
import { GetTransactionByIdUseCase } from './application/getTransactionById';
import { DeleteTransactionUseCase, RestoreTransactionUseCase } from './application/deleteTransaction';
import { UpdateTransactionUseCase } from './application/updateTransaction';
import { UpdateTransactionWithLearningUseCase } from './application/updateTransactionWithLearning';
import { AnalyticsService } from './application/analyticsService';
import { ArchiveTransactionUseCase } from './application/archiveTransaction';
import { UnarchiveTransactionUseCase } from './application/unarchiveTransaction';
import { ArchiveMultipleTransactionsUseCase } from './application/archiveMultipleTransactions';
import { ArchiveAllByUserUseCase } from './application/archiveAllByUser';
import { GetArchivedTransactionsUseCase } from './application/getArchivedTransactions';
import { TransactionRepository } from './domain/transactionRepository';
import { CategoryResolver } from './domain/categoryResolver';
import { AccountResolver } from './domain/accountResolver';
import { PeriodTotalsService, UsdRateSource } from './application/periodTotalsService';
import { Transaction } from './domain/transactionEntity';
import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';
import { SubscriptionModule } from '../subscription/subscriptionModule';
import { UserModule } from '../user/userModule';

export class TransactionModule {
  private deleteTransactionUseCase: DeleteTransactionUseCase;
  private createTransactionUseCase: CreateTransactionUseCase;
  private categoryResolver?: CategoryResolver;
  private accountResolver?: AccountResolver;
  private periodTotals = new PeriodTotalsService();

  private restoreTransactionUseCase: RestoreTransactionUseCase;

  constructor(private repository: TransactionRepository) {
    this.deleteTransactionUseCase = new DeleteTransactionUseCase(repository);
    this.restoreTransactionUseCase = new RestoreTransactionUseCase(repository);
    this.createTransactionUseCase = new CreateTransactionUseCase(repository);
  }

  static create(): TransactionModule {
    const repository = RepositoryFactory.createTransactionRepository();
    return new TransactionModule(repository);
  }

  /**
   * Set subscription dependencies for usage tracking
   * Called after all modules are created to avoid circular dependencies
   */
  setSubscriptionDependencies(
    subscriptionModule: SubscriptionModule,
    userModule: UserModule
  ): void {
    this.deleteTransactionUseCase.setSubscriptionDependencies(
      subscriptionModule,
      userModule
    );
    this.restoreTransactionUseCase.setSubscriptionDependencies(subscriptionModule, userModule);
    this.createTransactionUseCase.setSubscriptionDependencies(
      subscriptionModule,
      userModule
    );
  }

  /** Categories live in the category module (FT-099); wired by createModules(). */
  setCategoryResolver(categoryResolver: CategoryResolver): void {
    this.categoryResolver = categoryResolver;
    this.createTransactionUseCase.setCategoryResolver(categoryResolver);
  }

  /** Dollars in totals convert at the user's effective rate (FT-103); wired by createModules(). */
  setUsdRateSource(rates: UsdRateSource): void {
    this.periodTotals.setRateSource(rates);
  }

  /** The one place period totals are computed (FT-103). */
  getPeriodTotalsService(): PeriodTotalsService {
    return this.periodTotals;
  }

  /** Accounts live in the account module (FT-101); wired by createModules(). */
  setAccountResolver(accountResolver: AccountResolver): void {
    this.accountResolver = accountResolver;
    this.createTransactionUseCase.setAccountResolver(accountResolver);
  }

  getCreateTransactionUseCase(): CreateTransactionUseCase {
    return this.createTransactionUseCase;
  }

  /** The records a client sent under this id, deleted ones too (FT-106). */
  findByClientId(userId: string, clientId: string): Promise<Transaction[]> {
    return this.repository.findByClientId(userId, clientId);
  }

  /** Records written to one of the user's accounts, for the account screen (FT-104). */
  async recordsOfAccount(userId: string, accountId: string): Promise<Transaction[]> {
    return (await this.repository.findByUserId(userId)).filter(record => record.accountId === accountId);
  }

  getTransactionHistoryUseCase(): GetTransactionHistoryUseCase {
    return new GetTransactionHistoryUseCase(this.repository);
  }

  /** Income and expenses of a period for the month tiles on Home (FT-111). */
  getPeriodTotalsUseCase(): GetPeriodTotalsUseCase {
    return new GetPeriodTotalsUseCase(this.repository, this.periodTotals);
  }

  getGetUserTransactionsUseCase(): GetUserTransactionsUseCase {
    return new GetUserTransactionsUseCase(this.repository);
  }

  getGetTransactionByIdUseCase(): GetTransactionByIdUseCase {
    return new GetTransactionByIdUseCase(this.repository);
  }

  getRestoreTransactionUseCase(): RestoreTransactionUseCase {
    return this.restoreTransactionUseCase;
  }

  getDeleteTransactionUseCase(): DeleteTransactionUseCase {
    return this.deleteTransactionUseCase;
  }

  getUpdateTransactionUseCase(): UpdateTransactionUseCase {
    return new UpdateTransactionUseCase(this.repository, this.categoryResolver, this.accountResolver);
  }

  getUpdateTransactionWithLearningUseCase(): UpdateTransactionWithLearningUseCase {
    return new UpdateTransactionWithLearningUseCase(this.repository, this.categoryResolver, this.accountResolver);
  }

  getAnalyticsService(): AnalyticsService {
    return new AnalyticsService(this.repository, this.periodTotals);
  }

  getRepository(): TransactionRepository {
    return this.repository;
  }

  // Archive use cases
  getArchiveTransactionUseCase(): ArchiveTransactionUseCase {
    return new ArchiveTransactionUseCase(this.repository);
  }

  getUnarchiveTransactionUseCase(): UnarchiveTransactionUseCase {
    return new UnarchiveTransactionUseCase(this.repository);
  }

  getArchiveMultipleTransactionsUseCase(): ArchiveMultipleTransactionsUseCase {
    return new ArchiveMultipleTransactionsUseCase(this.repository);
  }

  getArchiveAllByUserUseCase(): ArchiveAllByUserUseCase {
    return new ArchiveAllByUserUseCase(this.repository);
  }

  getGetArchivedTransactionsUseCase(): GetArchivedTransactionsUseCase {
    return new GetArchivedTransactionsUseCase(this.repository);
  }
}
