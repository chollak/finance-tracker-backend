import { TransactionSemanticType } from '../../transaction/domain/transactionSemanticType';
import { Transaction } from '../../transaction/domain/transactionEntity';
import { CaptureAssumption, DetectedDebt, ItemWithoutAmount } from '../../voiceProcessing/domain/processedTransaction';
import { RecordCurrency, RecordSource } from '../../transaction/domain/recordSource';

/**
 * Quick Capture is the shared application boundary every client (Telegram, Mini App,
 * iPhone Shortcut) goes through. These types are the API contract; keep them free of
 * transport/persistence concerns so all three clients can depend on them.
 */

export const CAPTURE_SOURCES = ['telegram', 'miniapp', 'ios_shortcut'] as const;

export type CaptureSource = typeof CAPTURE_SOURCES[number];

export function isCaptureSource(value: unknown): value is CaptureSource {
  return typeof value === 'string' && (CAPTURE_SOURCES as readonly string[]).includes(value);
}

/**
 * The source of a payment the iOS app sends ready (FT-176). Set by the server, never by a client: a phrase cannot claim
 * it, so it is not a `CaptureSource`.
 */
export const PAYMENT_SOURCE = 'apple_pay' satisfies RecordSource;

/** What a capture result says it came from: a phrase's source, or a payment's. */
export type CaptureResultSource = CaptureSource | typeof PAYMENT_SOURCE;

/**
 * `draft` is intentionally absent: there is no parse-without-save path today, and a
 * status the code cannot produce would be a lie in the contract.
 */
export type QuickCaptureStatus = 'saved' | 'needs_review' | 'no_transaction';

export interface QuickCaptureRequest {
  text: string;
  userId: string;
  userName?: string;
  /** Echoed back for client-side routing and stored on every record (FT-103); `miniapp` when absent. */
  source?: CaptureSource;
  /**
   * The client's id for this capture (FT-106). A repeat returns the records the first request created —
   * deleted ones with `deletedAt` — without parsing the text again.
   */
  clientId?: string;
  /**
   * When the phrase was typed on the phone (FT-175): it is dated by that day, not by the day it arrived — «вчера» is the
   * day before it. Within `CAPTURED_AT_LIMITS` of the server's clock; a repeat of a `clientId` answers whatever it is.
   */
  capturedAt?: Date;
}

/**
 * A card payment the iOS app sends ready (FT-176, docs/QUICK_CAPTURE_API.md «Payments»): written as it came, only its
 * category is chosen — by the merchant.
 */
export interface PaymentCaptureRequest {
  userId: string;
  userName?: string;
  /** Exactly as it came, in minor units of `currency` (100 per сум or dollar). */
  amountMinor: number;
  currency: RecordCurrency;
  /** As Wallet names it: «KORZINKA 24». The category is chosen by it. */
  merchant?: string;
  /** The Kapelka account the phone maps the payment's card to, by name; without one the default awaits review. */
  accountName?: string;
  /** Required: the phone's queue repeats a payment until it gets an answer. */
  clientId: string;
  /** When the payment was made, by the phone; the record is dated by its day (FT-175). */
  capturedAt?: Date;
}

/** Port to the transaction module: the records a capture with this client id created (FT-106). */
export interface CaptureReplay {
  findByClientId(userId: string, clientId: string): Promise<Transaction[]>;
}

export interface CapturedTransaction {
  id: string;
  /** In the record's currency, major units. Additive fields below (FT-103) leave the contract intact. */
  amount: number;
  /** The same amount in integer minor units (FT-097), for screens that compute in them (FT-114). */
  amountMinor?: number;
  currency?: 'UZS' | 'USD';
  accountId?: string;
  accountName?: string;
  /** What the parse assumed: «45» as 45 000, a guessed category, the account, dollars without a dollar account. */
  assumptions?: CaptureAssumption[];
  type: 'income' | 'expense';
  semanticType: TransactionSemanticType;
  /** The current name of the record's category. */
  category: string;
  /** The user's category the record went to (FT-099): the review screen shows and changes it by id (FT-114). */
  categoryId?: string;
  description?: string;
  merchant?: string;
  date: string;
  confidence?: number;
  needsReview: boolean;
  /** Mirrors `countsAsRealExpense()` so clients never have to re-derive transfer/savings semantics. */
  countsAsRealExpense: boolean;
  /** Only on a repeated capture whose record was deleted since (FT-106). */
  deletedAt?: string;
}

/**
 * Debts are persisted by the same text pipeline, so they travel with the capture result.
 * Aliased rather than restated so the two shapes cannot drift apart.
 */
export type CapturedDebt = DetectedDebt;

/** Named without an amount, so not written (FT-123): «такси» in «кофе 25к, такси». */
export type CapturedWithoutAmount = ItemWithoutAmount;

/**
 * The answer to «Сколько?» for an item named without an amount (FT-123): the item is written with the
 * answer's amount through the same pipeline as a phrase.
 */
export interface AmountAnswerRequest {
  item: CapturedWithoutAmount;
  answer: {
    /** As written: «18к нал». */
    text: string;
    /** Major units of `currency`, «45» already read as 45 000. */
    amount: number;
    currency: 'UZS' | 'USD';
    kind?: 'cash' | 'card';
  };
  userId: string;
  userName?: string;
  source?: CaptureSource;
  /** The client's id for the answer (FT-167): the bot's answer sent again after a restart writes nothing. */
  clientId?: string;
}

export type CaptureAckAction = 'edit' | 'delete' | 'review';

export interface CaptureAck {
  title: string;
  summary: string;
  details?: string;
  actions: CaptureAckAction[];
}

export type CaptureReviewReason = 'transaction_needs_review' | 'debt_detected';

export interface CaptureReview {
  reasons: CaptureReviewReason[];
}

export interface QuickCaptureResult {
  status: QuickCaptureStatus;
  /** The trimmed phrase; for a payment its merchant, '' without one. */
  text: string;
  source?: CaptureResultSource;
  transactions: CapturedTransaction[];
  debts: CapturedDebt[];
  ack: CaptureAck;
  review: CaptureReview;
  /** True when this answers a repeated `clientId` (FT-106): nothing new was written. */
  repeated?: boolean;
  /** Named without an amount, so nothing was written for them (FT-123); absent when there are none. */
  withoutAmount?: CapturedWithoutAmount[];
}
