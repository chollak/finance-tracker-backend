import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { AppDataSource } from '../../../shared/infrastructure/database/database.config';
import { FxRate as FxRateEntity } from '../../../shared/infrastructure/database/entities/FxRate';
import { CbuRate } from '../domain/fxRate';
import { FxRateRepository } from '../domain/fxRateRepository';

export class SqliteFxRateRepository implements FxRateRepository {
  private repository: Repository<FxRateEntity>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(FxRateEntity);
  }

  async upsert(rate: CbuRate): Promise<void> {
    await this.repository.save(this.repository.create({
      date: rate.date,
      currency: rate.currency,
      rateMinor: rate.rateMinor,
      source: rate.source,
      fetchedAt: new Date(rate.fetchedAt),
    }));
  }

  async findByDate(date: string): Promise<CbuRate | null> {
    const entity = await this.repository.findOne({ where: { date, currency: 'USD' } });
    return entity ? this.toDomain(entity) : null;
  }

  async latest(onOrBefore?: string): Promise<CbuRate | null> {
    const entity = await this.repository.findOne({
      where: onOrBefore ? { currency: 'USD', date: LessThanOrEqual(onOrBefore) } : { currency: 'USD' },
      order: { date: 'DESC' },
    });
    return entity ? this.toDomain(entity) : null;
  }

  private toDomain(entity: FxRateEntity): CbuRate {
    return {
      date: entity.date,
      currency: 'USD',
      rateMinor: Number(entity.rateMinor),
      source: 'cbu',
      fetchedAt: new Date(entity.fetchedAt).toISOString(),
    };
  }
}
