// Transaction entity barrel export

// Types
export type { Transaction, CreateTransactionDTO, UpdateTransactionDTO, TransactionViewModel, TransactionSemanticType } from './model/types';
export type { DateGroup } from './lib/groupByDate';
export type { DayGroupSummary, DayGroupTransaction } from './lib/dayGroupSummary';

// View Model
export { transactionToViewModel } from './lib/toViewModel';

// Utils
export { groupTransactionsByDate } from './lib/groupByDate';
export {
  formatAllTransactionsLabel,
  formatHistorySubtitle,
  formatTransactionsScopeLabel,
} from './lib/transactionCountLabels';
export {
  DAY_EXPENSE_TOTAL_LABEL,
  formatDayGroupExpenseTotal,
  formatDayGroupNote,
  summarizeDayGroup,
} from './lib/dayGroupSummary';
export {
  getSemanticTypeLabel,
  getSemanticTypeBadgeVariant,
  isNonExpenseMovement,
  NEEDS_REVIEW_LABEL,
  NEEDS_REVIEW_CORRECTION_TYPES,
  matchesNeedsReviewQuery,
} from './lib/semanticType';

// API
export { transactionKeys } from './api/keys';
export {
  useTransactions,
  useTransaction,
  useTransactionAnalytics,
  useCategoryBreakdown,
  useMonthlyTrends,
  useArchivedTransactions,
} from './api/queries';
export {
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  useArchiveTransaction,
  useUnarchiveTransaction,
  useArchiveAllTransactions,
} from './api/mutations';

// UI Components
export { TransactionCard } from './ui/TransactionCard';
export { TransactionListItem } from './ui/TransactionListItem';
export { CompactTransactionRow } from './ui/CompactTransactionRow';
export { TransactionActions } from './ui/TransactionActions';
