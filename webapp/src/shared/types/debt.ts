// Debt types for frontend

export type DebtType = 'i_owe' | 'owed_to_me';
export type DebtStatus = 'active' | 'paid' | 'cancelled';

export interface Debt {
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
  relatedTransactionId?: string;
  splitGroupId?: string;
  splitExpenseId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DebtPayment {
  id: string;
  debtId: string;
  amount: number;
  note?: string;
  paidAt: string;
  createdAt: string;
}

export interface DebtWithPayments extends Debt {
  payments: DebtPayment[];
}

export interface DebtSummary {
  totalIOwe: number;
  totalOwedToMe: number;
  netBalance: number;
  activeDebtsCount: number;
  iOweCount: number;
  owedToMeCount: number;
}

export interface CreateDebtDTO {
  type: DebtType;
  personName: string;
  amount: number;
  currency?: string;
  description?: string;
  dueDate?: string;
  moneyTransferred?: boolean;
}

export interface UpdateDebtDTO {
  personName?: string;
  description?: string;
  dueDate?: string;
}

export interface PayDebtDTO {
  amount: number;
  note?: string;
  createTransaction?: boolean;
}
