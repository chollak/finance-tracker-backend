import type { TransactionSemanticType } from '@/shared/types';
import type { BadgeProps } from '@/shared/ui/badge';

// Human-readable Russian labels for each semantic transaction type.
const SEMANTIC_TYPE_LABELS: Record<TransactionSemanticType, string> = {
  expense: 'Расход',
  income: 'Доход',
  own_transfer: 'Перевод себе',
  saving_deposit: 'Вклад / накопление',
  debt: 'Долг',
  reimbursement: 'Возврат',
  cash_withdrawal: 'Наличные',
  group_payment: 'Групповой платёж',
};

// Badge color variant per semantic type, reusing existing design-token variants.
const SEMANTIC_TYPE_BADGE_VARIANT: Record<TransactionSemanticType, NonNullable<BadgeProps['variant']>> = {
  expense: 'expense',
  income: 'income',
  own_transfer: 'secondary',
  saving_deposit: 'success',
  debt: 'warning',
  reimbursement: 'secondary',
  cash_withdrawal: 'secondary',
  group_payment: 'secondary',
};

// Semantic types that are neither a real expense nor income — excluded from
// expense/budget analytics on the backend (see countsAsRealExpense / countsAsBudgetSpending).
const NON_EXPENSE_MOVEMENT_TYPES = new Set<TransactionSemanticType>([
  'own_transfer',
  'saving_deposit',
  'debt',
  'reimbursement',
  'cash_withdrawal',
  'group_payment',
]);

export function getSemanticTypeLabel(semanticType: TransactionSemanticType): string {
  return SEMANTIC_TYPE_LABELS[semanticType];
}

export function getSemanticTypeBadgeVariant(semanticType: TransactionSemanticType): NonNullable<BadgeProps['variant']> {
  return SEMANTIC_TYPE_BADGE_VARIANT[semanticType];
}

export function isNonExpenseMovement(semanticType: TransactionSemanticType): boolean {
  return NON_EXPENSE_MOVEMENT_TYPES.has(semanticType);
}
