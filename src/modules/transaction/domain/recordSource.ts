/**
 * Where a record came from (FT-103, docs/pastel/money-model.md). `apple_pay` — a card payment the iOS app sent ready,
 * with its amount and merchant (FT-176).
 */
export const RECORD_SOURCES = ['telegram', 'miniapp', 'ios_shortcut', 'apple_pay', 'receipt', 'manual'] as const;
export type RecordSource = (typeof RECORD_SOURCES)[number];

export function isRecordSource(value: unknown): value is RecordSource {
  return typeof value === 'string' && (RECORD_SOURCES as readonly string[]).includes(value);
}

export type RecordCurrency = 'UZS' | 'USD';

export function isRecordCurrency(value: unknown): value is RecordCurrency {
  return value === 'UZS' || value === 'USD';
}
