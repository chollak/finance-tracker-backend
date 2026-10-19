// Transaction entity barrel export

// Types
export type { Transaction, CreateTransactionDTO, UpdateTransactionDTO, TransactionViewModel, TransactionSemanticType, PeriodTotals } from './model/types';
export type { RecordDay, RecordRow, RecordCategory } from './lib/recordDays';
export type { DateGroup } from './lib/groupByDate';
export type { DayGroupSummary, DayGroupTransaction } from './lib/dayGroupSummary';

// View Model
export { transactionToViewModel } from './lib/toViewModel';

// Utils
export { groupTransactionsByDate } from './lib/groupByDate';
export { buildRecordDays } from './lib/recordDays';
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
export { balanceReaderKeys } from './api/balanceReaders';
export {
  useTransactions,
  useTransaction,
  useTransactionAnalytics,
  useCategoryBreakdown,
  useMonthlyTrends,
  useArchivedTransactions,
  useRecentRecords,
  usePeriodTotals,
} from './api/queries';
export {
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  deleteTransaction,
  useArchiveTransaction,
  useUnarchiveTransaction,
  useArchiveAllTransactions,
} from './api/mutations';

// UI Components
export { TransactionCard } from './ui/TransactionCard';
export { TransactionListItem } from './ui/TransactionListItem';
export { CompactTransactionRow } from './ui/CompactTransactionRow';
export { TransactionActions } from './ui/TransactionActions';
export { RecordDayList } from './ui/RecordDayList';
