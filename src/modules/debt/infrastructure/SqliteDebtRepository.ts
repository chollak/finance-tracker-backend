import { Repository } from 'typeorm';
import { AppDataSource } from '../../../shared/infrastructure/database/database.config';
import { Debt } from '../../../shared/infrastructure/database/entities/Debt';
import { DebtRepository } from '../domain/debtRepository';
import { DebtEntity, CreateDebtData, DebtStatus, DebtType } from '../domain/debtEntity';

/** Only the write CreateDebtUseCase makes; the rest went with the debt routes (#265). */
export class SqliteDebtRepository implements DebtRepository {
  private debtRepository: Repository<Debt>;

  constructor() {
    this.debtRepository = AppDataSource.getRepository(Debt);
  }

  async create(data: CreateDebtData): Promise<DebtEntity> {
    const debt = this.debtRepository.create({
      userId: data.userId,
      type: data.type,
      personName: data.personName,
      originalAmount: data.amount,
      remainingAmount: data.amount,
      currency: data.currency || 'UZS',
      description: data.description,
      dueDate: data.dueDate,
      status: DebtStatus.ACTIVE
    });

    const savedDebt = await this.debtRepository.save(debt);
    return this.mapToEntity(savedDebt);
  }

  private mapToEntity(debt: Debt): DebtEntity {
    return {
      id: debt.id,
      userId: debt.userId,
      type: debt.type as DebtType,
      personName: debt.personName,
      originalAmount: Number(debt.originalAmount),
      remainingAmount: Number(debt.remainingAmount),
      currency: debt.currency,
      description: debt.description,
      status: debt.status as DebtStatus,
      dueDate: debt.dueDate,
      createdAt: debt.createdAt,
      updatedAt: debt.updatedAt
    };
  }
}
