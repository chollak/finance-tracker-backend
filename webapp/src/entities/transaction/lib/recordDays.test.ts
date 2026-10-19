import { describe, expect, it } from 'vitest';
import { MINUS, NBSP } from '@/shared/lib/money';
import type { Transaction } from '@/shared/types';
import { buildRecordDays, type RecordCategory } from './recordDays';

/**
 * FT-111: the recent records on Home are grouped by day (docs/pastel/components/TransactionList.md): a day
 * label, then rows with the category, the note and the amount — expenses «−» in ink, income «+» in green,
 * сум without a unit, dollars with one.
 */

const TODAY = '2026-10-14';

function record(overrides: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    date: TODAY,
    category: 'Другое',
    description: '',
    amount: 0,
    type: 'expense',
    userId: 'u',
    ...overrides,
  };
}

const CATEGORIES: Record<string, RecordCategory> = {
  pr: { name: 'Продукты', color: 'peach' },
  tr: { name: 'Транспорт', color: 'sky' },
  zp: { name: 'Зарплата', color: 'mint' },
  fr: { name: 'Фриланс', color: 'lilac' },
};
const categoryOf = (item: Transaction) => (item.categoryId ? CATEGORIES[item.categoryId] : undefined);

describe('recent records by day', () => {
  // The board's records: two today, three yesterday (one in dollars)
  const records = [
    record({ id: 't1', categoryId: 'pr', amountMinor: 18_640_000, description: 'Супермаркет' }),
    record({ id: 't2', categoryId: 'tr', amountMinor: 2_400_000, description: 'Такси' }),
    record({ id: 't3', categoryId: 'zp', type: 'income', amountMinor: 1_250_000_000, date: '2026-10-13', description: 'За сентябрь' }),
    record({ id: 't5', categoryId: 'fr', type: 'income', amountMinor: 30_000, currency: 'USD', date: '2026-10-13', description: 'Лендинг' }),
    record({ id: 't6', categoryId: 'tr', amountMinor: 1_800_000, date: '2026-10-12', description: 'Метро' }),
  ];

  it('groups in the order the API gives, with «Сегодня», «Вчера» and the weekday', () => {
    const days = buildRecordDays(records, { today: TODAY, categoryOf });

    expect(days.map((day) => day.label)).toEqual(['Сегодня', 'Вчера', 'Понедельник, 12 октября']);
    expect(days.map((day) => day.rows.map((row) => row.id))).toEqual([['t1', 't2'], ['t3', 't5'], ['t6']]);
  });

  it('shows the category, the note and a signed amount: сум without a unit, dollars with one', () => {
    const [today, yesterday] = buildRecordDays(records, { today: TODAY, categoryOf });

    expect(today.rows[0]).toMatchObject({
      title: 'Продукты',
      color: 'peach',
      note: 'Супермаркет',
      amount: `${MINUS}186${NBSP}400`,
      tone: 'expense',
    });
    expect(yesterday.rows[0]).toMatchObject({ title: 'Зарплата', amount: `+12${NBSP}500${NBSP}000`, tone: 'income' });
    expect(yesterday.rows[1]).toMatchObject({ title: 'Фриланс', amount: `+300,00${NBSP}USD`, tone: 'income' });
  });

  it('names the full amount with its unit for screen readers', () => {
    const [today] = buildRecordDays(records, { today: TODAY, categoryOf });

    expect(today.rows[0].ariaLabel).toBe(`Продукты, ${MINUS}186${NBSP}400${NBSP}сум, Супермаркет. Открыть`);
  });

  it('falls back to the record’s own category and colour, the merchant, and «Без заметки»', () => {
    const [day] = buildRecordDays(
      [
        record({ id: 'a', categoryId: 'unknown', category: 'Кафе', categoryColor: 'rose', merchant: 'Bon', amountMinor: 2_500_000 }),
        record({ id: 'b', category: 'Связь', categoryColor: 'not-a-colour', amount: 9000 }),
      ],
      { today: TODAY, categoryOf }
    );

    expect(day.rows[0]).toMatchObject({ title: 'Кафе', color: 'rose', note: 'Bon' });
    // A record without amountMinor (older writers) is read from its amount in сум
    expect(day.rows[1]).toMatchObject({ title: 'Связь', color: 'mist', note: 'Без заметки', amount: `${MINUS}9${NBSP}000` });
  });

  it('puts a record whose date keeps a full moment on its local day', () => {
    const [day] = buildRecordDays([record({ id: 'legacy', date: '2026-10-14T05:30:00.000Z', amountMinor: 100 })], {
      today: TODAY,
      categoryOf,
    });

    expect(day.label).toBe('Сегодня');
  });

  it('has nothing to group when there are no records', () => {
    expect(buildRecordDays([], { today: TODAY, categoryOf })).toEqual([]);
  });
});
