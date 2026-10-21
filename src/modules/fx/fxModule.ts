import { FxRateRepository } from './domain/fxRateRepository';
import { CbuClient } from './domain/cbuClient';
import { FxRateService, OwnRateStore } from './application/fxRateService';
import { HttpCbuClient } from './infrastructure/HttpCbuClient';
import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';

/** USD rates (FT-102): Central Bank rate by date and the user's own rate. */
export class FxModule {
  private service: FxRateService;

  constructor(repository: FxRateRepository, client: CbuClient, ownRates: OwnRateStore) {
    this.service = new FxRateService(repository, client, ownRates);
  }

  static create(ownRates: OwnRateStore): FxModule {
    return new FxModule(RepositoryFactory.createFxRateRepository(), new HttpCbuClient(), ownRates);
  }

  getService(): FxRateService {
    return this.service;
  }
}
