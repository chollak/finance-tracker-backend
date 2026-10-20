// Account entity: the user's accounts, balances and their total (FT-101); one account's operations and the
// writes of the accounts screen (FT-118)

export type {
  Account,
  AccountsOverview,
  AccountPatch,
  NewAccount,
  AccountMove,
  MoveKind,
  AccountOperation,
  RecordOperation,
  MoveOperation,
  AccountOperations,
} from './model/types';
export { useAccounts, useAccountOperations } from './api/queries';
export { accountKeys } from './api/keys';
export { createAccount, updateAccount, deleteAccount, adjustBalance, deleteMove, restoreMove } from './api/writes';
export { visibleAccounts, accountCaption, accountIcon, type AccountIcon } from './lib/accounts';
export {
  OPERATIONS_WINDOW_DAYS,
  firstOperationsWindow,
  nextOperationsWindow,
  mergeOperationWindows,
  type OperationsWindow,
} from './lib/operationWindows';
