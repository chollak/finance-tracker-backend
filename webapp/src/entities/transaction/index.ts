// Transaction entity barrel export

// Types
export type {
  Transaction,
  CreateTransactionDTO,
  UpdateTransactionDTO,
  TransactionViewModel,
  TransactionSemanticType,
  PeriodTotals,
  FrequentRecord,
  HistoryQuery,
  HistoryPage,
  HistorySummary,
  NetInUzs,
} from './model/types';
export type { TransactionPatch } from './api/mutations';
export type { RecordDay, RecordRow, RecordCategory, DayTotal } from './lib/recordDays';

// View Model
export { transactionToViewModel } from './lib/toViewModel';

// Utils
export { buildRecordDays } from './lib/recordDays';
export { deviceHistoryPage, formatNetMinor, isHistoryNarrowed, netInUzs, parseHistorySearch } from './lib/historySearch';
export {
  getSemanticTypeLabel,
  getSemanticTypeBadgeVariant,
  isNonExpenseMovement,
  NEEDS_REVIEW_LABEL,
  NEEDS_REVIEW_CORRECTION_TYPES,
} from './lib/semanticType';

// API
export { transactionKeys } from './api/keys';
export { balanceReaderKeys } from './api/balanceReaders';
export {
  useTransactions,
  useRecord,
  useTransactionAnalytics,
  useCategoryBreakdown,
  useMonthlyTrends,
  useRecentRecords,
  useRecordHistory,
  usePeriodTotals,
  useFrequentRecords,
} from './api/queries';
export {
  useCreateTransaction,
  useUpdateTransaction,
  deleteTransaction,
  restoreTransaction,
  patchTransaction,
} from './api/mutations';

// UI Components
export { TransactionCard } from './ui/TransactionCard';
export { TransactionListItem } from './ui/TransactionListItem';
export { TransactionActions } from './ui/TransactionActions';
export { RecordDayList } from './ui/RecordDayList';
