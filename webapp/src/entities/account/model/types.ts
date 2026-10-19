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
