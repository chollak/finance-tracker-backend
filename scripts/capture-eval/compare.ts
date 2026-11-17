import { CaptureOutcome, CaptureRecord } from './phraseSet';

/** What a reading of a phrase can differ in from the expected one. */
export const FIELDS = ['count', 'amount', 'currency', 'type', 'category', 'date', 'account', 'needsReview'] as const;
export type Field = (typeof FIELDS)[number];

export const FIELD_NAMES: Record<Field, string> = {
  count: 'число записей',
  amount: 'сумма',
  currency: 'валюта',
  type: 'тип',
  category: 'категория',
  date: 'дата',
  account: 'счёт',
  needsReview: '«Нужно проверить»',
};

/** The fields two records differ in; `type` is the record's kind and its meaning together. */
function recordDifferences(expected: CaptureRecord, actual: CaptureRecord): Field[] {
  const differs: Record<Exclude<Field, 'count'>, boolean> = {
    amount: expected.amountMinor !== actual.amountMinor,
    currency: expected.currency !== actual.currency,
    type: expected.type !== actual.type || expected.semanticType !== actual.semanticType,
    category: expected.category !== actual.category,
    date: expected.date !== actual.date,
    account: expected.account !== actual.account,
    needsReview: expected.needsReview !== actual.needsReview,
  };
  return FIELDS.filter((field): field is Exclude<Field, 'count'> => field !== 'count' && differs[field]);
}

/**
 * The fields the written outcome differs from the expected one in; empty when it is the same. A different number of
 * records — or of items named without an amount — is `count` alone: which record is which is then a guess. With the
 * same number, each expected record is paired with the written one closest to it, so the order the model lists them
 * in does not matter. Items without an amount are compared by type and category: how the model words one is its own.
 */
export function differences(expected: CaptureOutcome, actual: CaptureOutcome): Field[] {
  if (expected.records.length !== actual.records.length || expected.withoutAmount.length !== actual.withoutAmount.length) {
    return ['count'];
  }

  const found = new Set<Field>();
  const left = [...actual.records];
  for (const record of expected.records) {
    const closest = left
      .map((candidate, index) => ({ index, fields: recordDifferences(record, candidate) }))
      .sort((a, b) => a.fields.length - b.fields.length)[0];
    left.splice(closest.index, 1);
    closest.fields.forEach(field => found.add(field));
  }

  const unpriced = (outcome: CaptureOutcome) => outcome.withoutAmount.map(item => `${item.type}:${item.category}`).sort();
  if (unpriced(expected).join('|') !== unpriced(actual).join('|')) found.add('category');

  return FIELDS.filter(field => found.has(field));
}

/** «25 000,00»: minor units as an amount with its thousands in groups. */
function amountOf(amountMinor: number): string {
  const [whole, fraction] = (Math.abs(amountMinor) / 100).toFixed(2).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${fraction}`;
}

/** One outcome as a line of a report: «−25 000,00 UZS Кафе 2026-11-18 Карта». Made of the set's invented phrases only. */
export function describeOutcome(outcome: CaptureOutcome): string {
  const records = outcome.records.map(record => [
    `${record.type === 'income' ? '+' : '−'}${amountOf(record.amountMinor)} ${record.currency}`,
    record.category,
    record.semanticType === record.type ? '' : `(${record.semanticType})`,
    record.date,
    record.account,
    record.needsReview ? '[проверить]' : '',
  ].filter(Boolean).join(' '));
  const unpriced = outcome.withoutAmount.map(item => `без суммы: ${item.description} → ${item.category}`);
  return [...records, ...unpriced].join('; ') || 'ничего не записано';
}
