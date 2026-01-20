import { DebtRepository } from './domain/debtRepository';
import { CreateDebtUseCase } from './application/createDebt';
import { GetDebtsUseCase } from './application/getDebts';
import { UpdateDebtUseCase } from './application/updateDebt';
import { DeleteDebtUseCase } from './application/deleteDebt';
import { PayDebtUseCase } from './application/payDebt';
import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';
import { TransactionModule } from '../transaction/transactionModule';
import { SubscriptionModule } from '../subscription/subscriptionModule';
import { UserModule } from '../user/userModule';

export class DebtModule {
  readonly repository: DebtRepository;
  readonly createDebtUseCase: CreateDebtUseCase;
  readonly getDebtsUseCase: GetDebtsUseCase;
  readonly updateDebtUseCase: UpdateDebtUseCase;
  readonly deleteDebtUseCase: DeleteDebtUseCase;
  readonly payDebtUseCase: PayDebtUseCase;

  constructor(
    transactionModule: TransactionModule,
    subscriptionModule?: SubscriptionModule,
    userModule?: UserModule
  ) {
    // Infrastructure
    this.repository = RepositoryFactory.createDebtRepository();

    // Application layer - Use Cases
    this.createDebtUseCase = new CreateDebtUseCase(
      this.repository,
      transactionModule.getCreateTransactionUseCase(),
      subscriptionModule,
      userModule
    );
    this.getDebtsUseCase = new GetDebtsUseCase(this.repository);
    this.updateDebtUseCase = new UpdateDebtUseCase(this.repository);
    this.deleteDebtUseCase = new DeleteDebtUseCase(
      this.repository,
      subscriptionModule,
      userModule
    );
    this.payDebtUseCase = new PayDebtUseCase(
      this.repository,
      transactionModule.getCreateTransactionUseCase(),
      subscriptionModule,
      userModule
    );
  }

  static create(
    transactionModule: TransactionModule,
    subscriptionModule?: SubscriptionModule,
    userModule?: UserModule
  ): DebtModule {
    return new DebtModule(transactionModule, subscriptionModule, userModule);
  }

  getRepository(): DebtRepository {
    return this.repository;
  }
}
