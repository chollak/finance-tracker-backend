import { CreateTransactionUseCase } from './application/createTransaction';
import { GetTransactionsUseCase } from './application/getTransactions';
import { GetUserTransactionsUseCase } from './application/getUserTransactions';
import { AnalyticsService } from './application/analyticsService';
import { NotionRepository } from './infrastructure/notionRepository';
import { DummyCategoryVectorRepository } from './infrastructure/dummyCategoryVectorRepository';
import { NotionService } from '../../infrastructure/services/notionService';
import { TransactionRepository } from './domain/transactionRepository';
import { CategoryVectorRepository } from './domain/categoryVectorRepository';

export class TransactionModule {
  constructor(
    private repository: TransactionRepository,
    private categoryRepository: CategoryVectorRepository
  ) {}

  static create(notionService: NotionService): TransactionModule {
    const repository = new NotionRepository(notionService);
    const categoryRepository = new DummyCategoryVectorRepository();
    return new TransactionModule(repository, categoryRepository);
  }

  getCreateTransactionUseCase(): CreateTransactionUseCase {
    return new CreateTransactionUseCase(
      this.repository,
      this.categoryRepository
    );
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
