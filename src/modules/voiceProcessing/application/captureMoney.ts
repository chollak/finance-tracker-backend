import { ParsedTransaction } from '../domain/transcriptionService';
import { PaymentHints } from '../domain/paymentHints';
import { TransactionSemanticType } from '../../transaction/domain/transactionSemanticType';
import { readWrittenNumber, writtenNumbersIn } from '../domain/writtenNumber';

// A magnitude word («к», «тыс», «млн») or a currency word right after the number: written in full.
const UNIT_AFTER = /^\s?(?:млрд|миллиард\p{L}*|mlrd|млн|миллион\p{L}*|mln|тысяч\p{L}*|тыщ\p{L}*|тыс|ming|[кk]|сум|sum|uzs|\$)(?![\p{L}\p{N}_])/iu;

/** Below this a сум amount is not a real price: «кофе 45» is 45 000 сум (design-system «Догадки бота видны»). */
const SHORTENED_BELOW = 1000;

/**
 * «кофе 45» means 45 000 сум: a number under a thousand, written bare — without «к», «тыс» or «сум» — is read as
 * thousands, and the answer says so («"45" понял как 45 000 сум», captureAssumptions). A fraction too, as in the answer
 * to «Сколько?»: «кофе 1,5» is 1 500 сум, «12,50» 12 500 — there are no sums under one сум (Shukur, 2026-10-30, FT-185).
 * Only for money going out: small incomes are real («кэшбэк 870», interest). Dollars and numbers the text does not
 * spell out stay as they are.
 */
export function expandShortenedThousands(
  amount: number,
  text: string,
  currency: 'UZS' | 'USD',
  type: 'income' | 'expense' = 'expense'
): number {
  if (type !== 'expense' || currency !== 'UZS' || amount <= 0 || amount >= SHORTENED_BELOW) return amount;
  const writtenBare = writtenNumbersIn(text).some(({ token, index }) => {
    const before = text.slice(0, index);
    const after = text.slice(index + token.length);
    return readWrittenNumber(token) === amount && !/\$\s?$/.test(before) && !UNIT_AFTER.test(after);
  });
  // Whole сум: 1.1 × 1000 is 1100.0000000000002 in floating point
  return writtenBare ? Math.round(amount * 1000) : amount;
}

export interface CaptureMoney {
  amount: number;
  currency: 'UZS' | 'USD';
  /** The account kind the wording names, for the account choice (FT-103). */
  kind?: 'cash' | 'card';
  /** Text to look for an account name in; only when the phrase is about one record. */
  accountText?: string;
}

/** Transfers, savings and withdrawals move the user's own money; «нал» there is not a payment method. */
export function isOwnMovement(semanticType: TransactionSemanticType): boolean {
  return semanticType === 'own_transfer' || semanticType === 'saving_deposit' || semanticType === 'cash_withdrawal';
}

/**
 * Amount, currency and account hints of one parsed record (FT-103). With one record the words of the
 * whole phrase apply to it; with several («кофе 25к налом и подписка 9.99$») each keeps what the
 * parser gave it, because «налом» and «$» belong to different records. Moving own money («перевёл
 * 500 000 на Humo») names where the money went, not where it was paid from, so neither the kind nor an
 * account named in the text chooses the account: it is the default one.
 */
export function captureMoneyOf(
  item: ParsedTransaction,
  text: string,
  hints: PaymentHints,
  itemCount: number,
  semanticType: TransactionSemanticType
): CaptureMoney {
  const single = itemCount === 1;
  const ownMovement = isOwnMovement(semanticType);
  const currency = item.currency === 'USD' || (single && hints.currency === 'USD') ? 'USD' : 'UZS';
  const kind = ownMovement ? undefined : item.paymentKind ?? (single ? hints.kind : undefined);
  const amount = expandShortenedThousands(item.amount || 0, text, currency, item.type === 'income' ? 'income' : 'expense');
  return {
    // Сумы are whole, tiyin round half up: «1 234,50 сум» is 1 235 (Shukur, 2026-10-30, FT-185); dollars keep cents
    amount: currency === 'UZS' ? Math.round(amount) : amount,
    currency,
    kind,
    accountText: single && !ownMovement ? text : undefined,
  };
}
