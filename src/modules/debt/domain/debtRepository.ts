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
  findById(id: string): Promise<DebtEntity | null>;
  findByUserId(userId: string, status?: DebtStatus): Promise<DebtEntity[]>;
  findByType(userId: string, type: DebtType): Promise<DebtEntity[]>;
  update(id: string, data: UpdateDebtData): Promise<DebtEntity>;
  delete(id: string): Promise<void>;

  // Debt with payments
  findWithPayments(id: string): Promise<DebtWithPayments | null>;

  // Payments
  addPayment(data: PayDebtData): Promise<DebtPaymentEntity>;
  findPaymentById(paymentId: string): Promise<DebtPaymentEntity | null>;
  findPaymentsByDebtId(debtId: string): Promise<DebtPaymentEntity[]>;
  deletePayment(paymentId: string): Promise<void>;

  // Summary
  getSummary(userId: string): Promise<DebtSummary>;

  // Utility
  updateRemainingAmount(debtId: string, amount: number): Promise<void>;
  markAsPaid(debtId: string): Promise<void>;
}
