import { MAX_ABS_AMOUNT_MINOR, MINOR_PER_MAJOR } from '../../../../shared/domain/money/money';
import { detectPaymentHints, stripPaymentWords } from '../../../../modules/voiceProcessing/domain/paymentHints';

/**
 * A text that is only an amount (FT-122) — the answer to «Напишите новую сумму — например, 150к.»:
 * «150к», «150 000», «1,5 млн», «60$», «145 000 сум», and with an account, «18к нал». Anything else is
 * not an answer, and the question closes. As on the board («Бот · запись текстом и голосом»):
 * - a bare number under a thousand in сум is thousands, for an income too («45» is 45 000 сум): the bot
 *   says so;
 * - «к», «тыс», «млн» without a unit are сум, also under a dollar record: the record then moves to a
 *   сум account;
 * - «нал», «наличными», «картой» move the record to an account of that kind.
 */

export type AmountReply =
  | { kind: 'amount'; amountMinor: number; currency: 'UZS' | 'USD'; written?: string; account?: 'cash' | 'card' }
  | { kind: 'not_positive' }
  | { kind: 'too_big' };

export interface AmountReplyRecord {
  currency: 'UZS' | 'USD';
}

const MAGNITUDE = '(?:млрд|миллиард\\p{L}*|mlrd|млн|миллион\\p{L}*|mln|тысяч\\p{L}*|тыщ\\p{L}*|тыс\\.?|ming|к|k)';
const SUM_WORDS = '(?:сум|сўм|so\'?m|sum|uzs)';
const AMOUNT_ONLY = new RegExp(`^([-−]?\\d[\\d\\s.,]*?)\\s*(${MAGNITUDE})?\\s*(${SUM_WORDS})?$`, 'iu');

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
  const compact = raw.replace(/[\s ]/g, '');
  if (/^\d+$/.test(compact)) return Number(compact);
  if (!hasMagnitude && /^\d{1,3}(?:[.,]\d{3})+$/.test(compact)) return Number(compact.replace(/[.,]/g, ''));
  if (/^\d+[.,]\d+$/.test(compact)) return Number(compact.replace(',', '.'));
  return null;
}

export function parseAmountReply(text: string, record: AmountReplyRecord): AmountReply | null {
  // «$», «долл», «нал», «картой» are read as hints and taken out; what is left must be the amount alone
  const hints = detectPaymentHints(text);
  const trimmed = stripPaymentWords(text).replace(/[.!]+$/, '').trim();
  const match = AMOUNT_ONLY.exec(trimmed);
  if (!match) return null;
  const [, rawNumber, magnitude, sumUnit] = match;

  const negative = /^[-−]/.test(rawNumber);
  const value = readNumber(rawNumber.replace(/^[-−]/, ''), Boolean(magnitude));
  if (value === null || !Number.isFinite(value)) return null;
  if (negative || value === 0) return { kind: 'not_positive' };

  const dollars = hints.currency === 'USD';
  if (dollars && sumUnit) return null; // «60$ сум» says two things
  const currency: 'UZS' | 'USD' = dollars ? 'USD' : sumUnit || magnitude ? 'UZS' : record.currency;

  let major = value * factorOf(magnitude);
  let written: string | undefined;
  const bare = !magnitude && !sumUnit && !dollars;
  if (bare && currency === 'UZS' && value < SHORTENED_BELOW) {
    major = value * 1000;
    written = rawNumber.trim();
  }

  const amountMinor = currency === 'UZS'
    ? Math.round(major) * MINOR_PER_MAJOR
    : Math.round(major * MINOR_PER_MAJOR);
  if (amountMinor <= 0) return { kind: 'not_positive' };
  if (!Number.isSafeInteger(amountMinor) || amountMinor > MAX_ABS_AMOUNT_MINOR) return { kind: 'too_big' };

  return {
    kind: 'amount',
    amountMinor,
    currency,
    ...(written ? { written } : {}),
    ...(hints.kind ? { account: hints.kind } : {}),
  };
}
