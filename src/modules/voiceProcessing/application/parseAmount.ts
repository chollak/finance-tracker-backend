/**
 * Amount extraction for the fast text paths.
 *
 * The rule this file exists to enforce: the fast path may not silently drop a
 * token attached to the number. A word right after the amount usually changes
 * what the amount means — "12 млн" is not 12 — so the parser either
 * understands that word or declines, and the phrase goes to the model instead
 * of being stored with a lost order of magnitude.
 */

const MAGNITUDE_MULTIPLIERS: ReadonlyArray<readonly [RegExp, number]> = [
  [/^(?:млрд|миллиард(?:а|ов)?)$/iu, 1_000_000_000],
  [/^(?:млн|миллион(?:а|ов)?|лям(?:а|ов)?)$/iu, 1_000_000],
  [/^(?:к|k|тыс|тысяч(?:а|и)?|тыщ(?:а|и)?)$/iu, 1_000],
];

const CURRENCY_WORDS = /^(?:сум|сум\.|so'?m|sum|uzs|руб|рублей|₽)$/iu;

/**
 * Function words that can follow an amount without changing it: "перевел 500000
 * на Alif". They are a closed class, unlike the open set of nouns, which is why
 * an unknown noun right after the number is treated as suspicious instead.
 */
const HARMLESS_FOLLOWERS = /^(?:на|в|во|за|для|с|со|из|из-за|от|до|по|у|о|об|при|про|над|под|без|через|и|а|но|же|бы|ли)$/iu;

export interface ParsedAmount {
  amount: number;
  /** The text with the number, its multiplier and any currency word removed. */
  remainder: string;
}

function magnitudeFor(token: string): number | null {
  const cleaned = token.replace(/[.,]$/u, '');
  for (const [pattern, multiplier] of MAGNITUDE_MULTIPLIERS) {
    if (pattern.test(cleaned)) return multiplier;
  }
  return null;
}

/**
 * Parses the single amount in a phrase.
 *
 * @returns null when the phrase holds no amount, more than one, or a token
 *   sits against the number that this parser cannot account for.
 */
export function parseAmount(text: string): ParsedAmount | null {
  const normalized = text.trim().replace(/\s+/gu, ' ');

  // A number, optionally with grouping spaces, optionally glued to a suffix
  // like "15к". Anything else attached is examined below.
  const numberPattern = /\d[\d\s.,]*/gu;
  const matches = [...normalized.matchAll(numberPattern)];
  if (matches.length !== 1) return null;

  const match = matches[0];
  const raw = match[0];

  // A sign in front changes the amount, so it may not be ignored either.
  if (/[-+]$/u.test(normalized.slice(0, match.index).trimEnd())) return null;

  // Grouping spaces belong to the number; a trailing separator does not.
  const numeric = Number(raw.replace(/\s/gu, '').replace(/[.,]$/u, '').replace(/,(?=\d{3}\b)/gu, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const before = normalized.slice(0, match.index).trim();
  let after = normalized.slice(match.index + raw.length).trim();

  // "15к" — the multiplier is glued to the digits.
  const glued = raw.match(/\d([A-Za-zЀ-ӿ]+)$/u);
  let multiplier = 1;
  if (glued) {
    const found = magnitudeFor(glued[1]);
    if (found === null) return null;
    multiplier = found;
  }

  const tokens = after ? after.split(' ') : [];

  if (multiplier === 1 && tokens.length > 0) {
    const found = magnitudeFor(tokens[0]);
    if (found !== null) {
      multiplier = found;
      tokens.shift();
    }
  }

  // What is left pressed against the number must be something known not to
  // change it. An unknown word there is usually a unit or a magnitude this
  // parser does not know, and guessing is exactly what this guard prevents.
  if (tokens.length > 0) {
    if (CURRENCY_WORDS.test(tokens[0])) {
      tokens.shift();
    } else if (!HARMLESS_FOLLOWERS.test(tokens[0])) {
      return null;
    }
  }

  const remainder = [before, tokens.join(' ')].filter(Boolean).join(' ').trim();
  if (!remainder) return null;

  return { amount: numeric * multiplier, remainder };
}
