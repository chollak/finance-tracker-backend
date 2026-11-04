import { DebtEntity, CreateDebtData } from './debtEntity';

/**
 * Debt Repository Interface - Domain Layer
 *
 * Only the write CreateDebtUseCase makes: the debt routes, their reads and payments are gone (#265).
 */
export interface DebtRepository {
  create(data: CreateDebtData): Promise<DebtEntity>;
}
