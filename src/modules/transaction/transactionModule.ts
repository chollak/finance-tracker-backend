import { CreateTransactionUseCase } from './application/createTransaction';
import { GetTransactionsUseCase } from './application/getTransactions';
import { GetUserTransactionsUseCase } from './application/getUserTransactions';
import { DeleteTransactionUseCase } from './application/deleteTransaction';
import { AnalyticsService } from './application/analyticsService';
import { NotionRepository } from './infrastructure/notionRepository';
import { NotionService } from '../../infrastructure/services/notionService';
import { TransactionRepository } from './domain/transactionRepository';

export class TransactionModule {
  constructor(private repository: TransactionRepository) {}

  static create(notionService: NotionService): TransactionModule {
    const repository = new NotionRepository(notionService);
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

  getAnalyticsService(): AnalyticsService {
    return new AnalyticsService(this.repository);
  }
}
