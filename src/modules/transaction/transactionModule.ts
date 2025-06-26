import { CreateTransactionUseCase } from './application/createTransaction';
import { GetTransactionsUseCase } from './application/getTransactions';
import { GetUserTransactionsUseCase } from './application/getUserTransactions';
import { AnalyticsService } from './application/analyticsService';
import { NotionRepository } from './infrastructure/notionRepository';
import { NotionService } from '../../infrastructure/services/notionService';
import { TransactionRepository } from './domain/transactionRepository';
import { CategoryVectorRepository } from '../categoryRecommendation/infrastructure/CategoryVectorRepository';

export class TransactionModule {
  constructor(private repository: TransactionRepository, private categoryRepo: CategoryVectorRepository) {}

  static create(notionService: NotionService, categoryRepo: CategoryVectorRepository): TransactionModule {
    const repository = new NotionRepository(notionService);
    return new TransactionModule(repository, categoryRepo);
  }

  getCreateTransactionUseCase(): CreateTransactionUseCase {
    return new CreateTransactionUseCase(this.repository, this.categoryRepo);
  }

  getGetTransactionsUseCase(): GetTransactionsUseCase {
    return new GetTransactionsUseCase(this.repository);
  }

  getGetUserTransactionsUseCase(): GetUserTransactionsUseCase {
    return new GetUserTransactionsUseCase(this.repository);
  }

  getAnalyticsService(): AnalyticsService {
    return new AnalyticsService(this.repository);
  }
}
