export type HomeTrustTransaction = {
  amount: number;
  type: 'income' | 'expense';
  semanticType?: string;
  needsReview?: boolean;
  _needsReview?: boolean;
  date: string;
  _semanticTypeLabel?: string;
};

export interface HomeTrustSummaryMetrics {
  outgoingTotal: number;
  excludedTotal: number;
  needsReviewTotal: number;
  needsReviewCount: number;
  realExpenseTotal: number;
  excludedLabels: string[];
}

const NON_EXPENSE_MOVEMENT_TYPES = new Set([
  'own_transfer',
  'saving_deposit',
  'debt',
  'reimbursement',
  'cash_withdrawal',
  'group_payment',
]);

function isNeedsReview(transaction: HomeTrustTransaction): boolean {
  return transaction.needsReview === true || transaction._needsReview === true;
}

function isOutgoing(transaction: HomeTrustTransaction): boolean {
  return transaction.type === 'expense';
}

function isNonExpenseMovement(transaction: HomeTrustTransaction): boolean {
  return NON_EXPENSE_MOVEMENT_TYPES.has(transaction.semanticType ?? 'expense');
}

export function calculateHomeTrustSummary(
  transactions: HomeTrustTransaction[],
  monthStart: string
): HomeTrustSummaryMetrics {
  const monthTransactions = transactions.filter((transaction) => transaction.date >= monthStart);
  const outgoingTransactions = monthTransactions.filter(isOutgoing);
  const excludedTransactions = outgoingTransactions.filter(
    (transaction) => !isNeedsReview(transaction) && isNonExpenseMovement(transaction)
  );
  const needsReviewTransactions = outgoingTransactions.filter(isNeedsReview);

  const outgoingTotal = outgoingTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const excludedTotal = excludedTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const needsReviewTotal = needsReviewTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const realExpenseTotal = Math.max(0, outgoingTotal - excludedTotal - needsReviewTotal);
  const excludedLabels = Array.from(
    new Set(
      excludedTransactions
        .map((transaction) => transaction._semanticTypeLabel)
        .filter((label): label is string => Boolean(label))
    )
  ).slice(0, 4);

  return {
    outgoingTotal,
    excludedTotal,
    needsReviewTotal,
    needsReviewCount: needsReviewTransactions.length,
    realExpenseTotal,
    excludedLabels,
  };
}
