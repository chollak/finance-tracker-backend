/**
 * A suspiciously large amount (FT-123, design-system «Один вопрос за раз»): the bot does not write it until
 * the person confirms it. The rule of the prototype board «Бот · не понял, не расслышал»: an expense in сум
 * from 10 000 000 in a category of small everyday spending — Кафе, Транспорт, Продукты, Связь, Здоровье.
 * «кофе 25000000» is most likely «кофе 25000» typed with extra zeros; a phone or a sofa is not.
 * Categories are told by their starter key, so a renamed «Кафе» keeps the rule.
 */

export const LARGE_AMOUNT_MIN_MINOR = 10_000_000 * 100;

/** Starter keys of everyday categories (`categoryPresets.ts`). */
export const LARGE_AMOUNT_CATEGORY_KEYS: readonly string[] = ['cafe', 'transport', 'groceries', 'telecom', 'health'];

export interface LargeAmountCandidate {
  type: 'income' | 'expense';
  currency: 'UZS' | 'USD';
  amountMinor: number;
  /** The starter key of the record's category; null for a category of the user's own. */
  presetKey?: string | null;
}

export function isSuspiciouslyLarge(record: LargeAmountCandidate): boolean {
  return record.type === 'expense'
    && record.currency === 'UZS'
    && Math.abs(record.amountMinor) >= LARGE_AMOUNT_MIN_MINOR
    && Boolean(record.presetKey && LARGE_AMOUNT_CATEGORY_KEYS.includes(record.presetKey));
}
