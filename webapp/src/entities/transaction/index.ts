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
export type { QueuedRecord, QueuedRecordInput } from './model/outbox';
export type { ListedRecord } from './lib/pendingRecords';

// View Model
export { transactionToViewModel } from './lib/toViewModel';

// Utils
export { buildRecordDays, recordRow, PENDING_CAPTION } from './lib/recordDays';
export { pendingRecord, withPendingRecords, queuedToastDetail, QUEUED_TITLE } from './lib/pendingRecords';
export { formatNetMinor, isHistoryNarrowed, netInUzs, parseHistorySearch } from './lib/historySearch';
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
  refreshAfterRecordsChanged,
} from './api/mutations';
// Records written without a connection (FT-129): the outbox and its send
export {
  queueRecords,
  writeOnDevice,
  cancelQueuedRecords,
  flushRecordOutbox,
  pendingRecordsOf,
  usePendingRecords,
  OUTBOX_SEND_TIMEOUT_MS,
  type OutboxFlush,
} from './api/recordOutbox';

// UI Components
export { TransactionCard } from './ui/TransactionCard';
export { TransactionListItem } from './ui/TransactionListItem';
export { TransactionActions } from './ui/TransactionActions';
export { RecordDayList, RecordRowItem } from './ui/RecordDayList';
