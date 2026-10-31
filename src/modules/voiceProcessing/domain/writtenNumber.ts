// A comma before one or two closing digits: «28 000,00», «4,50»
const DECIMAL_COMMA = /^([+-]?[\d.,]+),(\d{1,2})$/;
// Points before exactly three digits: «25.000», «1.234.567»
const POINT_GROUPS = /^[+-]?\d{1,3}(?:\.\d{3})+$/;
// One point or comma at most: «1.5», «3,2»
const ONE_SEPARATOR = /^[+-]?\d+(?:[.,]\d+)?$/;

// A phone number keeps its spaces, whatever its groups: «+998 90 123 45 67»
const PHONE = String.raw`\+\d+(?:\s\d+){2,}`;
// A space groups thousands only after a head of one to three digits and before exactly three: «25 000», not
// «25000 300»; a point or a comma stands between digits
const NUMBER = String.raw`[+-]?(?:\d{1,3}(?:\s\d{3}(?!\d))+|\d+)(?:[.,]\d+)*`;
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
 * A number as a phrase writes it (FT-185, FT-206): «28 000,00», «1 234,50», «150,000», «25.000», «4.50».
 * Spaces group thousands. A comma before one or two closing digits is the decimal one — Wallet writes a payment as
 * «28 000,00 UZS», and taking that comma for a group made it 2 800 000; any other comma groups thousands («150,000»).
 * A point before exactly three digits groups thousands too: «25.000» is 25 000, «4.500 $» 4 500 $ (Shukur,
 * 2026-10-31); before one or two it is the decimal one, «4.50», «1.5». Before «к», «тыс», «млн» (`beforeMagnitude`)
 * a single point or comma is a fraction, as in the answer to «Сколько?»: «1.5к», «3,2 млн», «1.500 млн» is 1,5
 * million. Null when the token is no number this way («1.234.5»).
 */
export function readWrittenNumber(token: string, { beforeMagnitude = false }: { beforeMagnitude?: boolean } = {}): number | null {
  const compact = token.replace(/\s/g, '');
  if (beforeMagnitude) return ONE_SEPARATOR.test(compact) ? Number(compact.replace(',', '.')) : null;
  const decimal = DECIMAL_COMMA.exec(compact);
  const whole = decimal ? decimal[1] : compact;
  const grouped = POINT_GROUPS.test(whole) ? whole.replace(/\./g, '') : whole.replace(/,/g, '');
  const value = Number(decimal ? `${grouped}.${decimal[2]}` : grouped);
  return Number.isFinite(value) ? value : null;
}
