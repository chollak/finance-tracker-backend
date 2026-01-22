import {
  DebtEntity,
  DebtPaymentEntity,
  CreateDebtData,
  UpdateDebtData,
  PayDebtData,
  DebtSummary,
  DebtWithPayments,
  DebtStatus,
  DebtType
} from './debtEntity';

/**
 * Debt Repository Interface - Domain Layer
 *
 * Defines the contract for debt persistence operations
 */
export interface DebtRepository {
  // Debt CRUD
  create(data: CreateDebtData): Promise<DebtEntity>;
  getById(id: string): Promise<DebtEntity | null>;
  getByUserId(userId: string, status?: DebtStatus): Promise<DebtEntity[]>;
  getByType(userId: string, type: DebtType): Promise<DebtEntity[]>;
  update(id: string, data: UpdateDebtData): Promise<DebtEntity>;
  delete(id: string): Promise<void>;

  // Debt with payments
  getWithPayments(id: string): Promise<DebtWithPayments | null>;

  // Payments
  addPayment(data: PayDebtData): Promise<DebtPaymentEntity>;
  getPaymentById(paymentId: string): Promise<DebtPaymentEntity | null>;
  getPaymentsByDebtId(debtId: string): Promise<DebtPaymentEntity[]>;
  deletePayment(paymentId: string): Promise<void>;

  // Summary
  getSummary(userId: string): Promise<DebtSummary>;

  // Utility
  updateRemainingAmount(debtId: string, amount: number): Promise<void>;
  markAsPaid(debtId: string): Promise<void>;
}
