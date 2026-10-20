import { MAX_ABS_AMOUNT_MINOR, MINOR_PER_MAJOR } from '../../../../shared/domain/money/money';

/**
 * A text that is only an amount (FT-122) — the answer to «Напишите новую сумму — например, 150к.»:
 * «150к», «150 000», «1,5 млн», «60$», «145 000 сум». Anything else is not an answer, and the question
 * closes. A bare number under a thousand in сум is thousands for an expense, as in capture
 * («кофе 45» is 45 000 сум): the bot says so.
 */

export type AmountReply =
  | { kind: 'amount'; amountMinor: number; currency: 'UZS' | 'USD'; written?: string }
  | { kind: 'not_positive' }
  | { kind: 'too_big' };

export interface AmountReplyRecord {
  currency: 'UZS' | 'USD';
  type: 'income' | 'expense';
}

const MAGNITUDE = '(?:млрд|миллиард\\p{L}*|mlrd|млн|миллион\\p{L}*|mln|тысяч\\p{L}*|тыщ\\p{L}*|тыс\\.?|ming|к|k)';
const SUM_WORDS = '(?:сум|сўм|so\'?m|sum|uzs)';
const USD_WORDS = '(?:\\$|usd|долл\\p{L}*|бакс\\p{L}*)';
const AMOUNT_ONLY = new RegExp(
  `^(\\$\\s*)?([-−]?\\d[\\d\\s.,]*?)\\s*(${MAGNITUDE})?\\s*(${SUM_WORDS}|${USD_WORDS})?$`,
  'iu'
);

const FACTORS: Array<[RegExp, number]> = [
  [/^(?:млрд|миллиард|mlrd)/iu, 1_000_000_000],
  [/^(?:млн|миллион|mln)/iu, 1_000_000],
  [/^(?:тыс|тыщ|ming|к|k)/iu, 1_000],
];

const SHORTENED_BELOW = 1000;

function factorOf(magnitude: string | undefined): number {
  if (!magnitude) return 1;
  return FACTORS.find(([pattern]) => pattern.test(magnitude))?.[1] ?? 1;
}

/**
 * «150 000», «150.000» and «150,000» are thousands groups; «1,5» and «60.50» are fractions. With a
 * magnitude word a single separator is always a fraction: «1.5 млн», «1,5к».
 */
function readNumber(raw: string, hasMagnitude: boolean): number | null {
  const compact = raw.replace(/[\s ]/g, '');
  if (/^\d+$/.test(compact)) return Number(compact);
  if (!hasMagnitude && /^\d{1,3}(?:[.,]\d{3})+$/.test(compact)) return Number(compact.replace(/[.,]/g, ''));
  if (/^\d+[.,]\d+$/.test(compact)) return Number(compact.replace(',', '.'));
  return null;
}

export function parseAmountReply(text: string, record: AmountReplyRecord): AmountReply | null {
  const trimmed = text.trim().replace(/[.!]+$/, '').trim();
  const match = AMOUNT_ONLY.exec(trimmed);
  if (!match) return null;
  const [, dollarSign, rawNumber, magnitude, unit] = match;

  const negative = /^[-−]/.test(rawNumber);
  const value = readNumber(rawNumber.replace(/^[-−]/, ''), Boolean(magnitude));
  if (value === null || !Number.isFinite(value)) return null;
  if (negative || value === 0) return { kind: 'not_positive' };

  const unitIsUsd = unit ? new RegExp(`^${USD_WORDS}$`, 'iu').test(unit) : false;
  const currency: 'UZS' | 'USD' = dollarSign || unitIsUsd ? 'USD' : unit ? 'UZS' : record.currency;

  let major = value * factorOf(magnitude);
  let written: string | undefined;
  const bare = !magnitude && !unit && !dollarSign;
  if (bare && currency === 'UZS' && record.type === 'expense' && Number.isInteger(value) && value < SHORTENED_BELOW) {
    major = value * 1000;
    written = rawNumber.trim();
  }

  const amountMinor = currency === 'UZS'
    ? Math.round(major) * MINOR_PER_MAJOR
    : Math.round(major * MINOR_PER_MAJOR);
  if (amountMinor <= 0) return { kind: 'not_positive' };
  if (!Number.isSafeInteger(amountMinor) || amountMinor > MAX_ABS_AMOUNT_MINOR) return { kind: 'too_big' };

  return written ? { kind: 'amount', amountMinor, currency, written } : { kind: 'amount', amountMinor, currency };
}
