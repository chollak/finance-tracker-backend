import { CreateTransactionUseCase } from './application/createTransaction';
import { GetTransactionsUseCase } from './application/getTransactions';
import { GetUserTransactionsUseCase } from './application/getUserTransactions';
import { GetTransactionByIdUseCase } from './application/getTransactionById';
import { DeleteTransactionUseCase } from './application/deleteTransaction';
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
import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';
import { SubscriptionModule } from '../subscription/subscriptionModule';
import { UserModule } from '../user/userModule';

export class TransactionModule {
  private deleteTransactionUseCase: DeleteTransactionUseCase;
  private createTransactionUseCase: CreateTransactionUseCase;
  private categoryResolver?: CategoryResolver;
  private accountResolver?: AccountResolver;

  constructor(private repository: TransactionRepository) {
    this.deleteTransactionUseCase = new DeleteTransactionUseCase(repository);
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

  /** Accounts live in the account module (FT-101); wired by createModules(). */
  setAccountResolver(accountResolver: AccountResolver): void {
    this.accountResolver = accountResolver;
    this.createTransactionUseCase.setAccountResolver(accountResolver);
  }

  getCreateTransactionUseCase(): CreateTransactionUseCase {
    return this.createTransactionUseCase;
  }

  getGetTransactionsUseCase(): GetTransactionsUseCase {
    return new GetTransactionsUseCase(this.repository);
  }

  getGetUserTransactionsUseCase(): GetUserTransactionsUseCase {
    return new GetUserTransactionsUseCase(this.repository);
  }

  getGetTransactionByIdUseCase(): GetTransactionByIdUseCase {
    return new GetTransactionByIdUseCase(this.repository);
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
    return new AnalyticsService(this.repository);
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
