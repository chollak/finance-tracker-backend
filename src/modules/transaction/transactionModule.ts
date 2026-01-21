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
import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';
import { SubscriptionModule } from '../subscription/subscriptionModule';
import { UserModule } from '../user/userModule';

export class TransactionModule {
  private deleteTransactionUseCase: DeleteTransactionUseCase;
  private createTransactionUseCase: CreateTransactionUseCase;

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
    return new UpdateTransactionUseCase(this.repository);
  }

  getUpdateTransactionWithLearningUseCase(): UpdateTransactionWithLearningUseCase {
    return new UpdateTransactionWithLearningUseCase(this.repository);
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
