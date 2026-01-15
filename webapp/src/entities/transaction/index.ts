// Transaction entity barrel export

// Types
export type { Transaction, CreateTransactionDTO, UpdateTransactionDTO, TransactionViewModel } from './model/types';
export type { DateGroup } from './lib/groupByDate';

// View Model
export { transactionToViewModel } from './lib/toViewModel';

// Utils
export { groupTransactionsByDate } from './lib/groupByDate';

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
export { TransactionActions } from './ui/TransactionActions';
