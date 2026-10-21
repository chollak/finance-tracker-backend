import { Currency } from './account';

/**
 * Money moved between the user's own accounts, or a balance set by hand (FT-104, money-model
 * «account_moves»). A move changes balances and nothing else: it is never income or expense and does
 * not reach analytics, day totals, the monthly review or goals.
 */
export const MOVE_KINDS = ['transfer', 'exchange', 'adjustment'] as const;
export type MoveKind = typeof MOVE_KINDS[number];

export const MOVE_NOTE_MAX_LENGTH = 200;

export function isMoveKind(value: unknown): value is MoveKind {
  return typeof value === 'string' && (MOVE_KINDS as readonly string[]).includes(value);
}

export interface AccountMove {
  id: string;
  userId: string;
  kind: MoveKind;
  /** Where the money left; null for an adjustment. */
  fromAccountId: string | null;
  /** Where it arrived; the adjusted account for an adjustment. */
  toAccountId: string;
  /** Given, in the «from» account's currency; null for an adjustment. */
  fromAmountMinor: number | null;
  /** Received, in the «to» account's currency; for an adjustment the signed difference. */
  toAmountMinor: number;
  /** Exchange only: сум×100 per $1 the deal was made at. */
  dealRateMinor: number | null;
  /** Exchange only: the Central Bank rate on the date, for «разница N сум не в вашу пользу». */
  cbuRateMinor: number | null;
  date: string;
  note: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

/** How much the move changed this account's balance; 0 if it does not touch it. */
export function moveChangeFor(move: AccountMove, accountId: string): number {
  let change = 0;
  if (move.toAccountId === accountId) change += move.toAmountMinor;
  if (move.fromAccountId === accountId) change -= move.fromAmountMinor ?? 0;
  return change;
}

/**
 * The deal rate of an exchange, сум×100 per $1, rounded half up: 100.00 USD → 1 260 000 сум is
 * 12 600.00 (1260000). Both amounts are minor units of their currencies; exactly one side is USD.
 */
export function dealRateMinor(
  from: { currency: Currency; amountMinor: number },
  to: { currency: Currency; amountMinor: number }
): number {
  const [uzsMinor, usdMinor] = from.currency === 'USD' ? [to.amountMinor, from.amountMinor] : [from.amountMinor, to.amountMinor];
  const numerator = BigInt(uzsMinor) * BigInt(100);
  const denominator = BigInt(usdMinor);
  return Number((numerator * BigInt(2) + denominator) / (denominator * BigInt(2)));
}
