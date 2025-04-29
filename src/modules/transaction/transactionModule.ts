// modules/transaction/transactionModule.ts
import { CreateTransactionUseCase } from './application/createTransaction';
import { GetTransactionsUseCase } from './application/getTransactions';;
import { NotionRepository } from './infrastructure/notionRepository';
import { NotionService } from '../../infrastructure/services/notionService';

export class TransactionModule {
  public static transactionRepository = new NotionRepository(new NotionService()); // Можно заменить на другую реализацию

  static getCreateTransactionUseCase(): CreateTransactionUseCase {
    return new CreateTransactionUseCase(this.transactionRepository);
  }

  static getGetTransactionsUseCase(): GetTransactionsUseCase {
    return new GetTransactionsUseCase(this.transactionRepository);
  }
}
