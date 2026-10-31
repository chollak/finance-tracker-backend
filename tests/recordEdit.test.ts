import { changesRecord, RecordEdit } from '../src/modules/transaction/domain/recordEdit';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';

/**
 * FT-248: an edit that leaves every field as stored changes nothing, so it writes nothing. The edit holds what the
 * update would write — the category and the account already resolved, the amount in minor units — and each field is
 * compared with the stored record.
 */
/** A JSON body may carry null where the type says string: the controller passes it on as sent. */
const JSON_NULL = null as unknown as string;

describe('changesRecord (FT-248)', () => {
  const stored: Transaction = {
    id: 'tx-1',
    userId: 'user-1',
    date: '2026-10-30',
    category: 'Кафе',
    categoryId: 'cat-cafe',
    accountId: 'acc-card',
    currency: 'UZS',
    description: 'кофе',
    amount: 25000,
    amountMinor: 2_500_000,
    type: 'expense',
    semanticType: 'expense',
    needsReview: true,
    merchant: 'Bon',
  };

  it('an empty edit changes nothing', () => {
    expect(changesRecord(stored, {})).toBe(false);
  });

  it.each<[string, RecordEdit]>([
    ['the same category', { categoryId: 'cat-cafe' }],
    ['the same amount in minor units', { amountMinor: 2_500_000 }],
    ['the same account', { accountId: 'acc-card' }],
    ['the same account and currency', { accountId: 'acc-card', currency: 'UZS' }],
    ['the same note', { description: 'кофе' }],
    ['the same day', { date: '2026-10-30' }],
    ['the same type', { type: 'expense' }],
    ['the same meaning', { semanticType: 'expense' }],
    ['the same «Нужно проверить»', { needsReview: true }],
    ['the same merchant', { merchant: 'Bon' }],
    ['every field as stored', {
      amountMinor: 2_500_000, categoryId: 'cat-cafe', accountId: 'acc-card', currency: 'UZS', description: 'кофе',
      date: '2026-10-30', type: 'expense', semanticType: 'expense', needsReview: true, merchant: 'Bon',
    }],
  ])('%s changes nothing', (_name, edit) => {
    expect(changesRecord(stored, edit)).toBe(false);
  });

  it.each<[string, RecordEdit]>([
    ['another category', { categoryId: 'cat-groceries' }],
    ['another amount', { amountMinor: 2_500_001 }],
    ['another account', { accountId: 'acc-cash' }],
    ['another currency', { currency: 'USD' }],
    ['another note', { description: 'капучино' }],
    ['a note cleared', { description: '' }],
    ['another day', { date: '2026-10-29' }],
    ['another type', { type: 'income' }],
    ['another meaning', { semanticType: 'own_transfer' }],
    ['«Нужно проверить» taken off', { needsReview: false }],
    ['another merchant', { merchant: 'Korzinka' }],
    ['one field the same, another new', { categoryId: 'cat-cafe', description: 'капучино' }],
    ['the same amount on another day', { amountMinor: 2_500_000, date: '2026-10-29' }],
  ])('%s changes the record', (_name, edit) => {
    expect(changesRecord(stored, edit)).toBe(true);
  });

  it('no note is no note: null, empty and missing are the same', () => {
    const withoutNote: Transaction = { ...stored, description: '' };
    expect(changesRecord(withoutNote, { description: '' })).toBe(false);
    expect(changesRecord(withoutNote, { description: JSON_NULL })).toBe(false);
    expect(changesRecord({ ...stored, description: undefined as never }, { description: '' })).toBe(false);
    // A note is not trimmed: spaces are written as sent, so they are a change
    expect(changesRecord(stored, { description: ' кофе' })).toBe(true);
  });

  it('no merchant is no merchant: null, empty and missing are the same', () => {
    const withoutMerchant: Transaction = { ...stored, merchant: undefined };
    expect(changesRecord(withoutMerchant, { merchant: '' })).toBe(false);
    expect(changesRecord(withoutMerchant, { merchant: JSON_NULL })).toBe(false);
    expect(changesRecord(withoutMerchant, { merchant: 'Bon' })).toBe(true);
  });

  it('a record without a stored currency is in сум, without «Нужно проверить» is not flagged', () => {
    const older: Transaction = { ...stored, currency: undefined, needsReview: undefined };
    expect(changesRecord(older, { currency: 'UZS', needsReview: false })).toBe(false);
    expect(changesRecord(older, { currency: 'USD' })).toBe(true);
    expect(changesRecord(older, { needsReview: true })).toBe(true);
  });

  it('a record with only the legacy amount compares in minor units', () => {
    const legacy: Transaction = { ...stored, amountMinor: undefined, amount: 12.5 };
    expect(changesRecord(legacy, { amountMinor: 1250 })).toBe(false);
    expect(changesRecord(legacy, { amountMinor: 1200 })).toBe(true);
  });

  it('a day stored as a moment (before FT-100) is a change: its day depends on the time zone, the write makes it a day', () => {
    const moment: Transaction = { ...stored, date: '2026-10-29T20:30:00.000Z' };
    // 2026-10-29 in UTC, 2026-10-30 in Tashkent: neither is taken as the same day
    expect(changesRecord(moment, { date: '2026-10-29' })).toBe(true);
    expect(changesRecord(moment, { date: '2026-10-30' })).toBe(true);
  });
});
