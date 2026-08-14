import type { TransactionSemanticType } from '@/shared/types';

/** Semantic types where money arrives rather than leaves. */
const INCOMING: ReadonlySet<TransactionSemanticType> = new Set(['income', 'reimbursement']);

/**
 * Direction of the money, derived from what kind of movement it is.
 *
 * The form asks once. Asking separately for direction would let a user save a
 * "перевод себе" marked as income, which no other surface could make sense of.
 */
export function deriveTransactionType(semanticType: TransactionSemanticType): 'income' | 'expense' {
  return INCOMING.has(semanticType) ? 'income' : 'expense';
}

/**
 * Order shown in the manual form: the two everyday cases first, then the
 * movements that exist precisely because they are not ordinary spending.
 */
export const MANUAL_SEMANTIC_TYPES: readonly TransactionSemanticType[] = [
  'expense',
  'income',
  'own_transfer',
  'saving_deposit',
  'cash_withdrawal',
  'debt',
  'reimbursement',
  'group_payment',
] as const;
