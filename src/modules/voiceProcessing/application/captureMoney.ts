import { ParsedTransaction } from '../domain/transcriptionService';
import { PaymentHints } from '../domain/paymentHints';
import { TransactionSemanticType } from '../../transaction/domain/transactionSemanticType';

const AMOUNT_TOKEN = /[+-]?\d[\d\s.,]*/g;
// A magnitude word («к», «тыс», «млн») or a currency word right after the number: written in full.
const UNIT_AFTER = /^\s?(?:млрд|миллиард\p{L}*|mlrd|млн|миллион\p{L}*|mln|тысяч\p{L}*|тыщ\p{L}*|тыс|ming|[кk]|сум|sum|uzs|\$)(?![\p{L}\p{N}_])/iu;

/** Below this a сум amount is not a real price: «кофе 45» is 45 000 сум (design-system «Догадки бота видны»). */
const SHORTENED_BELOW = 1000;

/**
 * «кофе 45» means 45 000 сум: a whole number under a thousand, written bare — without «к», «тыс» or
 * «сум» — is read as thousands, and the answer says so («"45" понял как 45 000 сум»,
 * captureAssumptions). Dollars, fractions and numbers the text does not spell out stay as they are.
 */
export function expandShortenedThousands(amount: number, text: string, currency: 'UZS' | 'USD'): number {
  if (currency !== 'UZS' || !Number.isInteger(amount) || amount < 1 || amount >= SHORTENED_BELOW) return amount;
  const writtenBare = [...text.matchAll(AMOUNT_TOKEN)].some(match => {
    const token = match[0].replace(/[\s.,]+$/, '');
    const before = text.slice(0, match.index ?? 0);
    const after = text.slice((match.index ?? 0) + token.length);
    return Number(token.replace(/\s/g, '')) === amount && !/\$\s?$/.test(before) && !UNIT_AFTER.test(after);
  });
  return writtenBare ? amount * 1000 : amount;
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
 * parser gave it, because «налом» and «$» belong to different records.
 */
export function captureMoneyOf(
  item: ParsedTransaction,
  text: string,
  hints: PaymentHints,
  itemCount: number,
  semanticType: TransactionSemanticType
): CaptureMoney {
  const single = itemCount === 1;
  const currency = item.currency === 'USD' || (single && hints.currency === 'USD') ? 'USD' : 'UZS';
  const kind = isOwnMovement(semanticType) ? undefined : item.paymentKind ?? (single ? hints.kind : undefined);
  return {
    amount: expandShortenedThousands(item.amount || 0, text, currency),
    currency,
    kind,
    accountText: single ? text : undefined,
  };
}
