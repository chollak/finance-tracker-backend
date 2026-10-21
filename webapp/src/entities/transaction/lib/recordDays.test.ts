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

describe('History by day (FT-116, board «История», TransactionList.md)', () => {
  const ACCOUNTS: Record<string, string> = { card: 'Карта', cash: 'Наличные', usd: 'Доллары' };
  const accountOf = (item: Transaction) => (item.accountId ? ACCOUNTS[item.accountId] : undefined);
  // 12 650 сум for a dollar
  const RATE = 1_265_000;

  // The board's first three days
  const history = [
    record({ id: 't1', categoryId: 'pr', amountMinor: 18_640_000, description: 'Супермаркет', accountId: 'card' }),
    record({ id: 't2', categoryId: 'tr', amountMinor: 2_400_000, description: 'Такси', accountId: 'cash' }),
    record({ id: 't3', categoryId: 'zp', type: 'income', amountMinor: 1_250_000_000, date: '2026-10-13', description: 'За сентябрь', accountId: 'card' }),
    record({ id: 't4', category: 'Кафе', categoryColor: 'rose', amountMinor: 14_500_000, date: '2026-10-13', description: 'Обед с командой', accountId: 'card' }),
    record({ id: 't5', categoryId: 'fr', type: 'income', amountMinor: 30_000, currency: 'USD', date: '2026-10-13', description: 'Лендинг', accountId: 'usd' }),
    record({ id: 't6', categoryId: 'tr', amountMinor: 3_200_000, date: '2026-10-13', description: 'Такси домой', accountId: 'card' }),
    record({ id: 't7', categoryId: 'tr', amountMinor: 6_000_000, date: '2026-10-12', description: 'Мобильная связь', accountId: 'card' }),
    record({ id: 't8', categoryId: 'tr', amountMinor: 8_500_000, date: '2026-10-12', description: 'Такси в аэропорт', accountId: 'cash' }),
    record({ id: 't9', categoryId: 'pr', amountMinor: 9_400_000, date: '2026-10-12', description: 'Рынок', accountId: 'cash' }),
  ];

  const historyDays = (dayTotals: { rateMinor: number | null; lastDayComplete: boolean }) =>
    buildRecordDays(history, { today: TODAY, categoryOf, accountOf, datedLabels: true, dayTotals });

  it('names the date of every day, and the account after the note', () => {
    const [today] = historyDays({ rateMinor: RATE, lastDayComplete: true });

    expect(historyDays({ rateMinor: RATE, lastDayComplete: true }).map((day) => day.label)).toEqual([
      'Сегодня, 14 октября',
      'Вчера, 13 октября',
      'Понедельник, 12 октября',
    ]);
    expect(today.rows.map((row) => row.note)).toEqual(['Супермаркет · Карта', 'Такси · Наличные']);
    expect(today.rows[0].ariaLabel).toBe(`Продукты, ${MINUS}186${NBSP}400${NBSP}сум, Супермаркет, Карта. Открыть`);
  });

  it('a record without a note shows its account alone', () => {
    const [day] = buildRecordDays([record({ id: 'a', categoryId: 'pr', amountMinor: 100, accountId: 'cash' })], {
      today: TODAY,
      categoryOf,
      accountOf,
      datedLabels: true,
    });

    expect(day.rows[0].note).toBe('Наличные');
  });

  it('totals each day in сум with its sign: income green, expenses muted, dollars at the rate with «≈»', () => {
    const days = historyDays({ rateMinor: RATE, lastDayComplete: true });

    expect(days.map((day) => day.total)).toEqual([
      { text: `${MINUS}210${NBSP}400${NBSP}сум`, tone: 'muted' },
      // 12 500 000 + 300 USD × 12 650 − 145 000 − 32 000
      { text: `≈${NBSP}+16${NBSP}118${NBSP}000${NBSP}сум`, tone: 'income' },
      { text: `${MINUS}239${NBSP}000${NBSP}сум`, tone: 'muted' },
    ]);
  });

  it('has no total for a day with dollars but no rate, nor for the last day while its next page is not read', () => {
    expect(historyDays({ rateMinor: null, lastDayComplete: true }).map((day) => day.total?.text ?? null)).toEqual([
      `${MINUS}210${NBSP}400${NBSP}сум`,
      null,
      `${MINUS}239${NBSP}000${NBSP}сум`,
    ]);
    expect(historyDays({ rateMinor: RATE, lastDayComplete: false }).map((day) => day.total?.text ?? null)).toEqual([
      `${MINUS}210${NBSP}400${NBSP}сум`,
      `≈${NBSP}+16${NBSP}118${NBSP}000${NBSP}сум`,
      null,
    ]);
  });

  it('Home has neither totals, nor accounts, nor dates after «Сегодня»', () => {
    const [today] = buildRecordDays(history, { today: TODAY, categoryOf });

    expect(today.label).toBe('Сегодня');
    expect(today.total).toBeUndefined();
    expect(today.rows[0].note).toBe('Супермаркет');
  });
});

describe('a category’s operations (FT-121, board «Аналитика · категория «Кафе»»)', () => {
  const ACCOUNTS: Record<string, string> = { card: 'Карта', cash: 'Наличные' };
  const accountOf = (item: Transaction) => (item.accountId ? ACCOUNTS[item.accountId] : undefined);
  const cafe: Record<string, RecordCategory> = { kf: { name: 'Кафе', color: 'rose' }, tr: { name: 'Транспорт', color: 'sky' } };
  const cafeOf = (item: Transaction) => (item.categoryId ? cafe[item.categoryId] : undefined);

  it('every row is of the one category: the note leads, the account goes under it, the circle keeps the category', () => {
    const [day] = buildRecordDays(
      [record({ id: 'k13', categoryId: 'kf', amountMinor: 14_500_000, description: 'Обед с командой', accountId: 'card', date: '2026-10-13' })],
      { today: TODAY, categoryOf: cafeOf, accountOf, datedLabels: true, lead: { categoryId: 'kf' } }
    );

    expect(day.label).toBe('Вчера, 13 октября');
    expect(day.rows[0]).toMatchObject({ title: 'Обед с командой', note: 'Карта', category: 'Кафе', color: 'rose', amount: `${MINUS}145${NBSP}000` });
    expect(day.rows[0].ariaLabel).toBe(`Обед с командой, ${MINUS}145${NBSP}000${NBSP}сум, Карта. Открыть`);
    expect(day.rows[0].categoryAriaLabel).toBe(`Сменить категорию: Кафе, ${MINUS}145${NBSP}000${NBSP}сум`);
  });

  it('a record without a note is named by its category; one of another category names it beside the account', () => {
    const [day] = buildRecordDays(
      [
        record({ id: 'a', categoryId: 'kf', amountMinor: 2_500_000, accountId: 'cash' }),
        record({ id: 'b', categoryId: 'tr', amountMinor: 3_200_000, description: 'Такси домой', accountId: 'card' }),
      ],
      { today: TODAY, categoryOf: cafeOf, accountOf, lead: { categoryId: 'kf' } }
    );

    expect(day.rows.map((item) => [item.title, item.note, item.category])).toEqual([
      ['Кафе', 'Наличные', 'Кафе'],
      ['Такси домой', 'Транспорт · Карта', 'Транспорт'],
    ]);
  });

  it('a day’s total counts the category’s own records only: one moved to another category is listed, not counted', () => {
    const [day, alone] = buildRecordDays(
      [
        record({ id: 'a', categoryId: 'kf', amountMinor: 2_500_000, description: 'Кофе', accountId: 'cash', date: '2026-10-13' }),
        record({ id: 'b', categoryId: 'pr', amountMinor: 14_500_000, description: 'Обед с командой', accountId: 'card', date: '2026-10-13' }),
        record({ id: 'c', categoryId: 'pr', amountMinor: 5_800_000, description: 'Обед', accountId: 'card', date: '2026-10-12' }),
      ],
      {
        today: TODAY,
        categoryOf: (item) => (item.categoryId === 'pr' ? { name: 'Продукты', color: 'peach' } : cafeOf(item)),
        accountOf,
        dayTotals: { rateMinor: null, lastDayComplete: true },
        lead: { categoryId: 'kf' },
      }
    );

    expect(day.rows.map((item) => item.note)).toEqual(['Наличные', 'Продукты · Карта']);
    expect(day.total).toEqual({ text: `${MINUS}25${NBSP}000${NBSP}сум`, tone: 'muted' });
    expect(alone.total).toEqual({ text: `0${NBSP}сум`, tone: 'muted' });
  });

  it('other lists keep the category as the title, and the circle shows it too', () => {
    const [day] = buildRecordDays([record({ id: 'k', categoryId: 'kf', amountMinor: 100, description: 'Кофе' })], { today: TODAY, categoryOf: cafeOf });
    expect([day.rows[0].title, day.rows[0].category, day.rows[0].note]).toEqual(['Кафе', 'Кафе', 'Кофе']);
  });
});
