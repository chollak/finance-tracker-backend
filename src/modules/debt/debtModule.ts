import { DebtRepository } from './domain/debtRepository';
import { CreateDebtUseCase } from './application/createDebt';
import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';
import { TransactionModule } from '../transaction/transactionModule';

/**
 * What is left of the debt module (#265, decision 2026-11-04): only what the frozen capture path still holds —
 * `VoiceProcessingModule` takes `createDebtUseCase` from it. The routes, reads, payments and limits are gone; the
 * rest goes in #266, after FT-217.
 */
export class DebtModule {
  readonly repository: DebtRepository;
  readonly createDebtUseCase: CreateDebtUseCase;

  constructor(transactionModule: TransactionModule) {
    this.repository = RepositoryFactory.createDebtRepository();
    this.createDebtUseCase = new CreateDebtUseCase(
      this.repository,
      transactionModule.getCreateTransactionUseCase()
    );
  }

  static create(transactionModule: TransactionModule): DebtModule {
    return new DebtModule(transactionModule);
  }
}
