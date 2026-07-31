export const TRANSACTION_SEMANTIC_TYPES = [
  'expense',
  'income',
  'own_transfer',
  'saving_deposit',
  'debt',
  'reimbursement',
  'cash_withdrawal',
  'group_payment',
] as const;

export type TransactionSemanticType = typeof TRANSACTION_SEMANTIC_TYPES[number];

export function isTransactionSemanticType(value: unknown): value is TransactionSemanticType {
  return typeof value === 'string'
    && (TRANSACTION_SEMANTIC_TYPES as readonly string[]).includes(value);
}

export function normalizeSemanticType(
  value: unknown,
  fallbackType: 'income' | 'expense' = 'expense'
): TransactionSemanticType {
  if (fallbackType === 'income' && value === 'expense') return 'income';
  if (isTransactionSemanticType(value)) return value;
  return fallbackType === 'income' ? 'income' : 'expense';
}

export function countsAsRealExpense(semanticType: TransactionSemanticType | undefined): boolean {
  return semanticType === 'expense';
}

export function countsAsBudgetSpending(semanticType: TransactionSemanticType | undefined): boolean {
  return semanticType === 'expense';
}

export function countsAsIncome(semanticType: TransactionSemanticType | undefined): boolean {
  return semanticType === 'income';
}
