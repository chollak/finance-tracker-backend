import { DebtRepository } from './domain/debtRepository';
import { CreateDebtUseCase } from './application/createDebt';
import { GetDebtsUseCase } from './application/getDebts';
import { UpdateDebtUseCase } from './application/updateDebt';
import { DeleteDebtUseCase } from './application/deleteDebt';
import { PayDebtUseCase } from './application/payDebt';
import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';
import { TransactionModule } from '../transaction/transactionModule';

export class DebtModule {
  readonly repository: DebtRepository;
  readonly createDebtUseCase: CreateDebtUseCase;
  readonly getDebtsUseCase: GetDebtsUseCase;
  readonly updateDebtUseCase: UpdateDebtUseCase;
  readonly deleteDebtUseCase: DeleteDebtUseCase;
  readonly payDebtUseCase: PayDebtUseCase;

  constructor(transactionModule: TransactionModule) {
    // Infrastructure
    this.repository = RepositoryFactory.createDebtRepository();

    // Application layer - Use Cases
    this.createDebtUseCase = new CreateDebtUseCase(
      this.repository,
      transactionModule.getCreateTransactionUseCase()
    );
    this.getDebtsUseCase = new GetDebtsUseCase(this.repository);
    this.updateDebtUseCase = new UpdateDebtUseCase(this.repository);
    this.deleteDebtUseCase = new DeleteDebtUseCase(this.repository);
    this.payDebtUseCase = new PayDebtUseCase(
      this.repository,
      transactionModule.getCreateTransactionUseCase()
    );
  }

  static create(transactionModule: TransactionModule): DebtModule {
    return new DebtModule(transactionModule);
  }

  getRepository(): DebtRepository {
    return this.repository;
  }
}
