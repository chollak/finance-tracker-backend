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

export class TransactionModule {
  constructor(private repository: TransactionRepository) {}

  static create(): TransactionModule {
    const repository = RepositoryFactory.createTransactionRepository();
    return new TransactionModule(repository);
  }

  getCreateTransactionUseCase(): CreateTransactionUseCase {
    return new CreateTransactionUseCase(this.repository);
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
    return new DeleteTransactionUseCase(this.repository);
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
