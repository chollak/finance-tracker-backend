import { CreateTransactionUseCase } from './application/createTransaction';
import { GetTransactionsUseCase } from './application/getTransactions';
import { GetUserTransactionsUseCase } from './application/getUserTransactions';
import { DeleteTransactionUseCase } from './application/deleteTransaction';
import { UpdateTransactionUseCase } from './application/updateTransaction';
import { UpdateTransactionWithLearningUseCase } from './application/updateTransactionWithLearning';
import { AnalyticsService } from './application/analyticsService';
import { NotionRepository } from './infrastructure/notionRepository';
import { NotionService } from '../../infrastructure/services/notionService';
import { SqliteTransactionRepository } from '../../database/repositories/SqliteTransactionRepository';
import { TransactionRepository } from './domain/transactionRepository';

export class TransactionModule {
  constructor(private repository: TransactionRepository) {}

  static create(notionService: NotionService): TransactionModule {
    const repository = new NotionRepository(notionService);
    return new TransactionModule(repository);
  }

  static createWithSqlite(): TransactionModule {
    const repository = new SqliteTransactionRepository();
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
}
