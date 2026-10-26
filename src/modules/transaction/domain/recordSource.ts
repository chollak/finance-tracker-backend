/** Where a record came from (FT-103, docs/pastel/money-model.md). */
export const RECORD_SOURCES = ['telegram', 'miniapp', 'ios_shortcut', 'receipt', 'manual'] as const;
export type RecordSource = (typeof RECORD_SOURCES)[number];

export function isRecordSource(value: unknown): value is RecordSource {
  return typeof value === 'string' && (RECORD_SOURCES as readonly string[]).includes(value);
}

export type RecordCurrency = 'UZS' | 'USD';

export function isRecordCurrency(value: unknown): value is RecordCurrency {
  return value === 'UZS' || value === 'USD';
}
