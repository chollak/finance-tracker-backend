import type { Transaction } from '@/shared/types';
import type { Currency } from '@/shared/lib/money';

/** An account as `GET /api/accounts` returns it (FT-101, docs/pastel/api.md «Счета»). */
export interface Account {
  id: string;
  name: string;
  kind: 'cash' | 'card';
  currency: Currency;
  openingBalanceMinor: number;
  /** YYYY-MM-DD: records before it are not in the balance. */
  openingDate: string;
  isHidden: boolean;
  sortOrder: number;
  /** In the account's currency. */
  balanceMinor: number;
}

/** `GET /api/accounts`: every account, hidden too, and the total of the visible ones. */
export interface AccountsOverview {
  accounts: Account[];
  /** Visible accounts in сум; dollars at the effective rate, rounded to whole сум. */
  totalMinor: number;
  /** The rate dollars were converted at; null with no visible dollar account or no rate yet. */
  rate: { rateMinor: number; source: 'cbu' | 'own'; date: string } | null;
  /** A dollar account is left out of the total: there is no rate. */
  missingRate: boolean;
}

/** What `PATCH /api/accounts/:id` takes (FT-101, FT-118): a new currency with the balance entered again. */
export type AccountPatch =
  | { name?: string; isHidden?: boolean }
  | { name?: string; currency: Currency; openingBalanceMinor: number };

/** `POST /api/accounts`: «Сколько на нём сейчас» is the opening balance today, not income. */
export interface NewAccount {
  name: string;
  kind: 'cash' | 'card';
  currency: Currency;
  openingBalanceMinor: number;
}

export type MoveKind = 'transfer' | 'exchange' | 'adjustment';

/** A transfer, an exchange or an adjustment (FT-104, docs/pastel/api.md «Перемещения»). */
export interface AccountMove {
  id: string;
  kind: MoveKind;
  /** Null for an adjustment. */
  fromAccountId: string | null;
  /** The adjusted account for an adjustment. */
  toAccountId: string;
  fromAmountMinor: number | null;
  /** For an adjustment the signed difference. */
  toAmountMinor: number;
  /** Exchange only: сум×100 per $1 of the deal. */
  dealRateMinor: number | null;
  cbuRateMinor: number | null;
  date: string;
  note: string | null;
  createdAt: string;
  deletedAt: string | null;
}

/** `POST /api/moves` from the transfer form (FT-119): one currency is a transfer, two currencies an exchange. */
export type NewMove =
  | { kind: 'transfer'; fromAccountId: string; toAccountId: string; amountMinor: number }
  | { kind: 'exchange'; fromAccountId: string; toAccountId: string; fromAmountMinor: number; toAmountMinor: number };

interface OperationBase {
  id: string;
  date: string;
  createdAt: string | null;
  /** The signed change of this account's balance, minor units of its currency. */
  amountMinor: number;
  /**
   * False before the opening date, on the opening day before the first launch entered the opening balance (FT-163),
   * or for a record in another currency. The account screen marks these «Не входит в остаток» (FT-148).
   */
  countsInBalance: boolean;
}

export interface RecordOperation extends OperationBase {
  type: 'record';
  /** The record as History has it. */
  record: Transaction;
}

export interface MoveOperation extends OperationBase {
  type: 'move';
  kind: MoveKind;
  /** The other account of a transfer or an exchange; null for an adjustment. */
  counterpart: { id: string; name: string; currency: Currency } | null;
  move: AccountMove;
}

export type AccountOperation = RecordOperation | MoveOperation;

/** `GET /api/accounts/:id/operations`: the account with its balance and its operations by day, newest first. */
export interface AccountOperations {
  /** `hasOperations`: records or moves, deleted ones too — the currency can no longer change (FT-118). */
  account: Account & { hasOperations: boolean };
  days: Array<{ date: string; operations: AccountOperation[] }>;
  /** Asked with `from`: the day of the newest operation before it, where the next window back ends; null — none. */
  earlierDate?: string | null;
}
