import { conservativeKeywordPattern } from '../../../shared/domain/semantics/semanticKeywords';
import { readWrittenNumber, writtenNumbersIn } from './writtenNumber';

/**
 * The amounts a phrase spells out — «25к», «3.5 млн», «1234 сум» — read by the text fast paths to pick the amount and
 * by the record writer to check the AI's amount against the text.
 */

const CURRENCY_WORD_ALTERNATIVES = ['сум', 'sum', 'uzs'];
export const CURRENCY_WORDS_PATTERN = conservativeKeywordPattern(CURRENCY_WORD_ALTERNATIVES, 'giu');
// The same currency words, but only where they directly follow an amount ("1234 сум"),
// which is what makes that number the one the user marked as money.
const CURRENCY_UNIT_AFTER_AMOUNT_PATTERN = new RegExp(
  `^\\s?(?:${CURRENCY_WORD_ALTERNATIVES.join('|')})(?![\\p{L}\\p{N}_])`,
  'iu'
);

// Magnitude words directly after an amount: "12 млн", "25 тыс", "15к". A bare "к"/"k" only counts
// when glued to the digits, so the preposition ("500000 к маме") and units ("4кг") stay untouched.
const MAGNITUDE_SUFFIX_SOURCE =
  "(?:\\s?(?:млрд|миллиард\\p{L}*|mlrd|млн|миллион\\p{L}*|mln|тысяч\\p{L}*|тыщ\\p{L}*|тыс|ming)|[кk])(?![\\p{L}\\p{N}_])";
const MAGNITUDE_SUFFIX_PATTERN = new RegExp(`^${MAGNITUDE_SUFFIX_SOURCE}`, 'iu');
// A decimal point inside a magnitude amount ("3.5 млн") is not sentence punctuation.
export const MAGNITUDE_DECIMAL_POINT_PATTERN = new RegExp(`(\\d)\\.(\\d+${MAGNITUDE_SUFFIX_SOURCE})`, 'giu');
// Nor is a point that groups thousands ("25.000", "1.234.567", FT-206).
export const THOUSANDS_POINT_PATTERN = /(?<=\d)\.(?=\d{3}(?!\d))/g;

const MAGNITUDE_FACTORS: Array<[RegExp, number]> = [
  [/^(?:млрд|миллиард|mlrd)/iu, 1_000_000_000],
  [/^(?:млн|миллион|mln)/iu, 1_000_000],
  [/^(?:тыс|тыщ|ming|к|k)/iu, 1_000],
];

function magnitudeFactor(suffix: string): number {
  const word = suffix.trim().toLowerCase();
  if (!word) {
    return 1;
  }

  const factor = MAGNITUDE_FACTORS.find(([pattern]) => pattern.test(word));
  return factor ? factor[1] : 1;
}

export interface ParsedAmount {
  amount: number;
  textBefore: string;
  textAfter: string;
}

/**
 * Reads the single amount of a phrase together with its magnitude word, and reports the text
 * left on either side of it so callers never keep "млн" in a description or merchant.
 * Returns null when the phrase does not hold exactly one usable amount.
 */
export function parseSingleAmount(normalizedText: string): ParsedAmount | null {
  const numbers = writtenNumbersIn(normalizedText);
  if (numbers.length !== 1) {
    return null;
  }

  const [{ token, index: start }] = numbers;
  const tokenEnd = start + token.length;

  const suffix = MAGNITUDE_SUFFIX_PATTERN.exec(normalizedText.slice(tokenEnd))?.[0] ?? '';
  // "1,5 млн" reads as either 1.5 or 15 million; hand such phrases to OpenAI rather than pick one.
  if (suffix && token.includes(',')) {
    return null;
  }

  const written = readWrittenNumber(token, { beforeMagnitude: Boolean(suffix) });
  if (written === null || written <= 0) {
    return null;
  }

  return {
    amount: written * magnitudeFactor(suffix),
    textBefore: normalizedText.slice(0, start),
    textAfter: normalizedText.slice(tokenEnd + suffix.length),
  };
}

export interface TextAmount {
  value: number;
  currencyMarked: boolean;
}

/**
 * Every number the phrase actually spells out, each tagged with whether a currency word follows it.
 * Unlike parseSingleAmount this never gives up on multi-number text — it is used to check an
 * already-parsed amount against the text, not to pick one.
 */
export function readTextAmounts(text: string): TextAmount[] {
  const normalizedText = text.trim().replace(/\s+/g, ' ');

  return writtenNumbersIn(normalizedText).flatMap(({ token, index: start }) => {
    const afterToken = normalizedText.slice(start + token.length);
    const suffix = MAGNITUDE_SUFFIX_PATTERN.exec(afterToken)?.[0] ?? '';

    const written = readWrittenNumber(token, { beforeMagnitude: Boolean(suffix) });
    if (written === null || written <= 0) {
      return [];
    }

    return [{
      value: written * magnitudeFactor(suffix),
      currencyMarked: CURRENCY_UNIT_AFTER_AMOUNT_PATTERN.test(afterToken.slice(suffix.length)),
    }];
  });
}
