import { describe, expect, it } from 'vitest';
import type { Transaction } from '@/shared/types';
import { NBSP } from '@/shared/lib/money';
import { buildRecordDays } from './recordDays';
import { pendingRecord, withPendingRecords } from './pendingRecords';

/**
 * FT-129, OfflineBar.md: a record waiting for the connection is in the list like any other — the amount and its colour
 * do not change — and its caption starts with «Ждёт связи», so an ellipsis never cuts it off.
 */

const TODAY = '2026-10-14';

const server = (id: string, date: string): Transaction => ({
  id,
  date,
  category: 'Продукты',
  categoryId: 'c-gro',
  description: 'Супермаркет',
  amount: 186_400,
  amountMinor: 18_640_000,
  currency: 'UZS',
  type: 'expense',
  userId: 'u1',
});

const coffee = pendingRecord({
  clientId: 'q1',
  userId: 'u1',
  createdAt: 2,
  type: 'expense',
  amountMinor: 2_500_000,
  currency: 'UZS',
  categoryId: 'c-cafe',
  categoryName: 'Кафе',
  date: TODAY,
  note: 'Кофе',
});

const rows = (records: readonly Transaction[]) =>
  buildRecordDays(records, { today: TODAY, categoryOf: () => ({ name: 'Кафе', color: 'rose' }) }).flatMap((day) => day.rows);

describe('a record waiting for the connection', () => {
  it('says «Ждёт связи» first in its caption', () => {
    const [row] = rows([coffee]);

    expect(row).toMatchObject({ note: 'Ждёт связи · Кофе', pending: true, amount: `−25${NBSP}000`, tone: 'expense' });
  });

  it('says it to a screen reader too', () => {
    expect(rows([coffee])[0].ariaLabel).toContain('ждёт связи');
  });

  it('without a note says «Без заметки» after it', () => {
    expect(rows([{ ...coffee, description: '' }])[0].note).toBe('Ждёт связи · Без заметки');
  });

  it('asks to check an amount the device read as thousands', () => {
    const lunch = pendingRecord({
      clientId: 'q2', userId: 'u1', createdAt: 3, type: 'expense', amountMinor: 4_500_000, currency: 'UZS',
      categoryName: 'Кафе', date: TODAY, note: 'Обед', checkAmount: true,
    });

    expect(rows([lunch])[0].note).toBe('Ждёт связи · Обед · проверьте сумму');
  });

  it('a record on the server is not marked', () => {
    expect(rows([server('t1', TODAY)])[0]).toMatchObject({ note: 'Супермаркет', pending: false });
  });
});

describe('the recent records with the waiting ones', () => {
  it('put the waiting ones first on their day and keep the limit', () => {
    const merged = withPendingRecords([server('t1', TODAY), server('t2', '2026-10-13')], [coffee], 2);

    expect(merged?.map((record) => record.id)).toEqual(['q1', 't1']);
  });

  it('newest waiting record first', () => {
    const later = { ...coffee, id: 'q9', createdAt: '2026-10-14T10:00:00.000Z' };
    const earlier = { ...coffee, id: 'q8', createdAt: '2026-10-14T09:00:00.000Z' };

    expect(withPendingRecords([], [earlier, later], 5)?.map((record) => record.id)).toEqual(['q9', 'q8']);
  });

  it('a waiting record of an earlier day goes to its day', () => {
    const yesterday = { ...coffee, id: 'q3', date: '2026-10-13' };

    expect(withPendingRecords([server('t1', TODAY)], [yesterday], 5)?.map((record) => record.id)).toEqual(['t1', 'q3']);
  });

  it('show the waiting ones even before the records were ever read', () => {
    expect(withPendingRecords(undefined, [coffee], 5)?.map((record) => record.id)).toEqual(['q1']);
  });

  it('are still unknown when nothing is read and nothing waits', () => {
    expect(withPendingRecords(undefined, [], 5)).toBeUndefined();
  });
});
