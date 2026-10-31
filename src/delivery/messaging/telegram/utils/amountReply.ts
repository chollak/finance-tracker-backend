import { MAX_ABS_AMOUNT_MINOR, MINOR_PER_MAJOR } from '../../../../shared/domain/money/money';
import { detectPaymentHints, stripPaymentWords } from '../../../../modules/voiceProcessing/domain/paymentHints';
import { readWrittenNumber, writtenNumbersIn } from '../../../../modules/voiceProcessing/domain/writtenNumber';
import { RU } from '../i18n/ru';

/**
 * A text that is only an amount (FT-122) — the answer to «Напишите новую сумму — например, 150к.»:
 * «150к», «150 000», «1,5 млн», «60$», «145 000 сум», and with an account, «18к нал». Anything else is
 * not an answer, and the question closes. As on the board («Бот · запись текстом и голосом»):
 * - a bare number under a thousand in сум is thousands, for an income too («45» is 45 000 сум): the bot
 *   says so;
 * - «к», «тыс», «млн» without a unit are сум, also under a dollar record: the record then moves to a
 *   сум account;
 * - «нал», «наличными», «картой» move the record to an account of that kind.
 * Two numbers («25000 300», «25 000, 18 000») are not one amount, as in a phrase (FT-205): the bot asks again (FT-224).
 */

export type AmountReply =
  | { kind: 'amount'; amountMinor: number; currency: 'UZS' | 'USD'; written?: string; account?: 'cash' | 'card' }
  | { kind: 'not_positive' }
  | { kind: 'too_big' }
  | { kind: 'several_numbers' };

/** An answer of numbers only that is no amount to write. */
export type AmountRefusal = Exclude<AmountReply, { kind: 'amount' }>;

/**
 * What the bot says to such an answer, keeping the question open — the same after «Сумму», «Сколько?», a large amount
 * and a quick-add category (FT-224). «не 25, а …» opens no question and says its own.
 */
export function refusalText(refusal: AmountRefusal): string {
  switch (refusal.kind) {
    case 'not_positive':
      return RU.record.amountNotPositive;
    case 'too_big':
      return RU.record.amountTooBig;
    case 'several_numbers':
      return RU.record.amountOneNumber;
  }
}

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

export function parseAmountReply(text: string, record: AmountReplyRecord): AmountReply | null {
  // «$», «долл», «нал», «картой» are read as hints and taken out; what is left must be the amount alone
  const hints = detectPaymentHints(text);
  const trimmed = stripPaymentWords(text).replace(/[.!]+$/, '').trim();
  const match = AMOUNT_ONLY.exec(trimmed);
  if (!match) return null;
  const [, rawNumber, magnitude, sumUnit] = match;
  // A space groups thousands only before exactly three digits (FT-205): «25000 300» is two numbers, «25 000 300» one
  if (writtenNumbersIn(rawNumber).length > 1) return { kind: 'several_numbers' };

  const negative = /^[-−]/.test(rawNumber);
  // As a phrase reads it (FT-206): «150 000», «150.000» and «150,000» are thousands groups; «1,5», «60.50» and
  // «28 000,00» are fractions. With a magnitude word a single separator is always a fraction: «1.5 млн», «1,5к»
  const value = readWrittenNumber(rawNumber.replace(/^[-−]/, ''), { beforeMagnitude: Boolean(magnitude) });
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

/**
 * «не 25, а 28» (FT-123, design-system «До любого поля — 2 нажатия»): the amount a record has and the one it
 * should have. Only the shape is read here; whether both sides are amounts is the handler's to say.
 */
export interface AmountCorrection {
  was: string;
  now: string;
}

const CORRECTION = /^не\s+(.+?)\s*,?\s+а\s+(.+)$/iu;

export function parseAmountCorrection(text: string): AmountCorrection | null {
  const match = CORRECTION.exec(text.trim().replace(/[.!]+$/, '').trim());
  if (!match) return null;
  const was = match[1].trim().replace(/,$/, '').trim();
  const now = match[2].trim();
  return was && now ? { was, now } : null;
}

/**
 * Whether «25» of «не 25, а 28» is the record's amount: read the way an answer is read («25» is 25 000 сум,
 * «25к», «25 000»), or as written (a cashback of 870 сум is «870»).
 */
export function writtenAmountMatches(written: string, record: { amountMinor: number; currency: 'UZS' | 'USD' }): boolean {
  const read = parseAmountReply(written, record);
  if (read?.kind === 'amount' && read.currency === record.currency && read.amountMinor === record.amountMinor) return true;
  const digits = written.replace(/[\s ]/g, '');
  if (!/^\d+$/.test(digits)) return false;
  return Number(digits) * MINOR_PER_MAJOR === record.amountMinor;
}
