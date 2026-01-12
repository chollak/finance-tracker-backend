import { BudgetRepository } from './domain/budgetRepository';
import { CreateBudgetUseCase } from './application/createBudget';
import { GetBudgetsUseCase } from './application/getBudgets';
import { UpdateBudgetUseCase } from './application/updateBudget';
import { DeleteBudgetUseCase } from './application/deleteBudget';
import { BudgetService } from './application/budgetService';
import { TransactionModule } from '../transaction/transactionModule';
import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';

export class BudgetModule {
  readonly repository: BudgetRepository;
  readonly createBudgetUseCase: CreateBudgetUseCase;
  readonly getBudgetsUseCase: GetBudgetsUseCase;
  readonly updateBudgetUseCase: UpdateBudgetUseCase;
  readonly deleteBudgetUseCase: DeleteBudgetUseCase;
  readonly budgetService: BudgetService;

  constructor(transactionModule: TransactionModule) {
    // Infrastructure
    this.repository = RepositoryFactory.createBudgetRepository();

    // Application layer
    this.createBudgetUseCase = new CreateBudgetUseCase(this.repository);
    this.getBudgetsUseCase = new GetBudgetsUseCase(this.repository);
    this.updateBudgetUseCase = new UpdateBudgetUseCase(this.repository);
    this.deleteBudgetUseCase = new DeleteBudgetUseCase(this.repository);
    this.budgetService = new BudgetService(this.repository, transactionModule.getRepository());
  }

  static create(transactionModule: TransactionModule): BudgetModule {
    return new BudgetModule(transactionModule);
  }
}