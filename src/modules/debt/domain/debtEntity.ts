/**
 * Debt Entity - Domain Layer
 *
 * What is left of the debt module (#265): the capture path still names these types until #266. The `debts` and
 * `debt_payments` tables and their rows stay (decision 2026-11-04).
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
}
