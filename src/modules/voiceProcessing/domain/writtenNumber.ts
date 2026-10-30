// A comma before one or two closing digits: «28 000,00», «4,50»
const DECIMAL_COMMA = /^([+-]?[\d.,]+),(\d{1,2})$/;

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
