/**
 * Debt Entity - Domain Layer
 *
 * Represents debts (money owed to/by the user)
 */

export enum DebtType {
  /** User owes money to someone */
  I_OWE = 'i_owe',
  /** Someone owes money to user */
  OWED_TO_ME = 'owed_to_me'
}

export enum DebtStatus {
  ACTIVE = 'active',
  PAID = 'paid',
  CANCELLED = 'cancelled'
}

/**
 * Main Debt entity
 */
export interface DebtEntity {
  id: string;
  userId: string;
  type: DebtType;
  personName: string;
  originalAmount: number;
  remainingAmount: number;
  currency: string;
  description?: string;
  status: DebtStatus;
  dueDate?: string;
  createdAt: Date;
  updatedAt: Date;

  // Link to transaction (when money was actually transferred)
  relatedTransactionId?: string;

  // Split expenses support (for future)
  splitGroupId?: string;
  splitExpenseId?: string;
}

/**
 * Debt Payment entity - tracks partial/full payments
 */
export interface DebtPaymentEntity {
  id: string;
  debtId: string;
  amount: number;
  note?: string;
  paidAt: Date;
  createdAt: Date;
}

/**
 * Data for creating a new debt
 */
export interface CreateDebtData {
  userId: string;
  type: DebtType;
  personName: string;
  amount: number;
  currency?: string;
  description?: string;
  dueDate?: string;

  // If true, creates a linked transaction (money already transferred)
  moneyTransferred?: boolean;

  // For split expenses (future)
  splitGroupId?: string;
  splitExpenseId?: string;
}

/**
 * Data for updating an existing debt
 */
export interface UpdateDebtData {
  personName?: string;
  description?: string;
  dueDate?: string | null;
  status?: DebtStatus;
}

/**
 * Data for making a payment on a debt
 */
export interface PayDebtData {
  debtId: string;
  amount: number;
  note?: string;
}

/**
 * Summary of debts for a user
 */
export interface DebtSummary {
  totalIOwe: number;        // Total I owe to others
  totalOwedToMe: number;    // Total others owe to me
  netBalance: number;       // Positive = others owe me more
  activeDebtsCount: number;
  iOweCount: number;        // Count of debts where I owe
  owedToMeCount: number;    // Count of debts owed to me
  currency: string;
}

/**
 * Debt with its payment history
 */
export interface DebtWithPayments extends DebtEntity {
  payments: DebtPaymentEntity[];
}
