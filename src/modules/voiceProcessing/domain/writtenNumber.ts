// A comma before one or two closing digits: «28 000,00», «4,50»
const DECIMAL_COMMA = /^([+-]?[\d.,]+),(\d{1,2})$/;

// A phone number keeps its spaces, whatever its groups: «+998 90 123 45 67»
const PHONE = String.raw`\+\d+(?:\s\d+){2,}`;
// A space groups thousands only before exactly three digits; a point or a comma stands between digits
const NUMBER = String.raw`[+-]?\d+(?:\s\d{3}(?!\d)|[.,]\d+)*`;
const WRITTEN_NUMBER = new RegExp(`${PHONE}|${NUMBER}`, 'g');

/** A number a phrase writes, as written, and where it starts. */
export interface WrittenNumber {
  token: string;
  index: number;
}

/**
 * The numbers of a phrase (FT-205): «28 000,00», «1 234 567», «1.5». A number took in any spaces and commas, so
 * two amounts in a row without a word between them were one — «кофе 25 000, 18 000» was 2 500 018 000, «обед 45000
 * 5,10» 450 005,1. Now a space groups thousands only before exactly three digits, and such a phrase has two numbers.
 */
export function writtenNumbersIn(text: string): WrittenNumber[] {
  return [...text.matchAll(WRITTEN_NUMBER)].map(match => ({ token: match[0], index: match.index ?? 0 }));
}

/**
 * A number as a phrase writes it (FT-185): «28 000,00», «28000,00», «1 234,50», «150,000», «3.5».
 * Spaces group thousands. A comma before one or two closing digits is the decimal one — Wallet writes a payment as
 * «28 000,00 UZS», and taking that comma for a group made it 2 800 000; any other comma groups thousands («150,000»).
 * A point reads as `Number` reads it. Null when the token is no number this way («1.234.567», «1.234,50»).
 */
export function readWrittenNumber(token: string): number | null {
  const compact = token.replace(/\s/g, '');
  const decimal = DECIMAL_COMMA.exec(compact);
  const value = Number(decimal ? `${decimal[1].replace(/,/g, '')}.${decimal[2]}` : compact.replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}
