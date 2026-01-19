// Debt entity barrel export

// API
export { debtKeys } from './api/keys';
export {
  useDebts,
  useDebt,
  useDebtWithPayments,
  useDebtSummary,
} from './api/queries';
export {
  useCreateDebt,
  useUpdateDebt,
  useDeleteDebt,
  useCancelDebt,
  usePayDebt,
  usePayDebtFull,
  useDeletePayment,
} from './api/mutations';

// Model
export type { DebtViewModel } from './model/types';
export type {
  Debt,
  DebtPayment,
  DebtWithPayments,
  DebtSummary,
  CreateDebtDTO,
  UpdateDebtDTO,
  PayDebtDTO,
  DebtType,
  DebtStatus,
} from './model/types';

// Lib
export { debtToViewModel } from './lib/toViewModel';

// UI
export { DebtCard } from './ui/DebtCard';
