import { describe, expect, it } from 'vitest';
import type { Transaction } from '@/shared/types';
import { NBSP } from '@/shared/lib/money';
import { buildRecordDays } from './recordDays';
import { pendingRecord, withPendingRecords } from './pendingRecords';

/**
 * FT-129, OfflineBar.md: a record waiting for the connection is in the list like any other — the amount and its colour
 * do not change — and its caption starts with «Ждёт связи», so an ellipsis never cuts it off; «проверьте сумму» comes
 * right after it for the same reason.
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
  writtenAt: 2,
  type: 'expense',
  amountMinor: 2_500_000,
  currency: 'UZS',
  categoryId: 'c-cafe',
  categoryName: 'Кафе',
  date: TODAY,
  note: 'Кофе',
});

/** A waiting record of a phrase written at `writtenAt`, queued at `createdAt`. */
const waiting = (clientId: string, writtenAt: number, createdAt: number) =>
  pendingRecord({
    clientId, userId: 'u1', createdAt, writtenAt, type: 'expense', amountMinor: 2_500_000, currency: 'UZS',
    categoryName: 'Кафе', date: TODAY, note: clientId,
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

  it('without a note says only «Ждёт связи»: «Без заметки» would add nothing', () => {
    expect(rows([{ ...coffee, description: '' }])[0].note).toBe('Ждёт связи');
  });

  describe('with an amount the device read as thousands', () => {
    const lunch = pendingRecord({
      clientId: 'q2', userId: 'u1', createdAt: 3, writtenAt: 3, type: 'expense', amountMinor: 4_500_000, currency: 'UZS',
      categoryName: 'Кафе', date: TODAY, note: 'Обед', checkAmount: true,
    });

    it('asks to check it right after «Ждёт связи», before the note an ellipsis may cut', () => {
      expect(rows([lunch])[0].note).toBe('Ждёт связи · проверьте сумму · Обед');
    });

    it('lets its caption take two lines: at 390px «Ждёт связи · проверьте сумму» is wider than one', () => {
      expect(rows([lunch])[0].noteWraps).toBe(true);
      expect(rows([coffee])[0].noteWraps).toBeFalsy();
    });

    it('without a note asks just that («45»)', () => {
      expect(rows([{ ...lunch, description: '' }])[0].note).toBe('Ждёт связи · проверьте сумму');
    });

    it('says it to a screen reader too', () => {
      expect(rows([lunch])[0].ariaLabel).toBe(`Кафе, −45${NBSP}000${NBSP}сум, Обед, ждёт связи, проверьте сумму`);
    });
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
    const earlier = waiting('q8', 1_000, 1_000);
    const later = waiting('q9', 9_000, 9_000);

    expect(withPendingRecords([], [earlier, later], 5)?.map((record) => record.id)).toEqual(['q9', 'q8']);
  });

  it('the records of one phrase in the order it named them: «такси 18к, кофе 25к» — Такси, then Кофе', () => {
    const before = waiting('q0', 1_000, 1_000);
    const taxi = waiting('q1', 5_000, 5_000);
    const coffeeOfPhrase = waiting('q2', 5_000, 5_001);

    expect(withPendingRecords([], [before, taxi, coffeeOfPhrase], 5)?.map((record) => record.id)).toEqual(['q1', 'q2', 'q0']);
    expect(withPendingRecords([], [coffeeOfPhrase, before, taxi], 5)?.map((record) => record.id)).toEqual(['q1', 'q2', 'q0']);
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
