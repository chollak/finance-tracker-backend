import type { AnalyticsCategoryRow, AnalyticsDay, CategoryAnalytics, MonthAnalytics } from '@/entities/analytics';
import type { Transaction } from '@/shared/types';

/**
 * The boards' data of the row «Аналитика — куда уходят деньги» (design/prototype/Pastel_Analytics.dc.html) as the
 * analytics API of FT-120 answers it: today is 14 October 2026, recording began in August. Sums in tiyin.
 */

const som = (value: number) => value * 100;

export const row = (overrides: Partial<AnalyticsCategoryRow> & Pick<AnalyticsCategoryRow, 'categoryId' | 'name'>): AnalyticsCategoryRow => ({
  amountMinor: 0,
  count: 3,
  sharePercent: 0,
  hasUsd: false,
  previousMinor: null,
  previousCount: null,
  change: null,
  ...overrides,
});

const NO_USD = { present: false, missingRate: false, rateMinor: null, source: null } as const;

/** «Аналитика · расходы»: 1–14 October against 1–14 September. */
export const OCTOBER_EXPENSES: MonthAnalytics = {
  month: '2026-10',
  today: '2026-10-14',
  currentMonth: '2026-10',
  firstMonth: '2026-08',
  period: { month: '2026-10', from: '2026-10-01', to: '2026-10-31', wholeMonth: false },
  previous: { month: '2026-09', from: '2026-09-01', to: '2026-09-14', wholeMonth: false },
  firstDays: null,
  usd: NO_USD,
  type: 'expense',
  comparable: true,
  totalMinor: som(7_684_400),
  hasUsd: false,
  previousTotalMinor: som(6_970_000),
  change: { kind: 'up', percent: 10, diffMinor: som(714_400) },
  categories: [
    row({ categoryId: 'pr', name: 'Продукты', amountMinor: som(2_140_000), count: 10, sharePercent: 28, previousMinor: som(1_980_000), previousCount: 9, change: { kind: 'up', percent: 8, diffMinor: som(160_000) } }),
    row({ categoryId: 'dm', name: 'Дом', amountMinor: som(1_450_000), count: 5, sharePercent: 19, previousMinor: som(1_450_000), previousCount: 4, change: { kind: 'same', percent: 0, diffMinor: 0 } }),
    row({ categoryId: 'kf', name: 'Кафе', amountMinor: som(1_092_000), count: 10, sharePercent: 14, previousMinor: som(780_000), previousCount: 9, change: { kind: 'up', percent: 40, diffMinor: som(312_000) } }),
    row({ categoryId: 'zd', name: 'Здоровье', amountMinor: som(520_000), count: 3, sharePercent: 7, previousMinor: som(610_000), previousCount: 3, change: { kind: 'down', percent: 15, diffMinor: som(-90_000) } }),
    row({ categoryId: 'dr', name: 'Другое', amountMinor: som(300_000), count: 2, sharePercent: 4, previousMinor: 0, previousCount: 0, change: { kind: 'new', percent: null, diffMinor: som(300_000) } }),
  ],
  insight: { kind: 'change', categoryId: 'kf', name: 'Кафе', direction: 'up', diffMinor: som(312_000), amountMinor: som(1_092_000), previousMinor: som(780_000) },
};

/** «Аналитика · доходы»: 1–14 October against the whole of September; freelance in dollars. */
export const OCTOBER_INCOME: MonthAnalytics = {
  ...OCTOBER_EXPENSES,
  type: 'income',
  previous: { month: '2026-09', from: '2026-09-01', to: '2026-09-30', wholeMonth: true },
  usd: { present: true, missingRate: false, rateMinor: 1_265_000, source: 'cbu' },
  totalMinor: som(16_295_000),
  hasUsd: true,
  previousTotalMinor: som(15_210_000),
  change: { kind: 'up', percent: 7, diffMinor: som(1_085_000) },
  categories: [
    row({ categoryId: 'zp', name: 'Зарплата', amountMinor: som(12_500_000), count: 1, sharePercent: 77, previousMinor: som(12_500_000), previousCount: 1, change: { kind: 'same', percent: 0, diffMinor: 0 } }),
    row({ categoryId: 'fr', name: 'Фриланс', amountMinor: som(3_795_000), count: 1, sharePercent: 23, hasUsd: true, previousMinor: som(2_530_000), previousCount: 1, change: { kind: 'up', percent: 50, diffMinor: som(1_265_000) } }),
    row({ categoryId: 'kb', name: 'Кэшбэк', amountMinor: 0, count: 0, sharePercent: 0, previousMinor: som(180_000), previousCount: 1, change: { kind: 'not_yet', percent: 0, diffMinor: som(-180_000) } }),
  ],
  insight: { kind: 'change', categoryId: 'fr', name: 'Фриланс', direction: 'up', diffMinor: som(1_265_000), amountMinor: som(3_795_000), previousMinor: som(2_530_000) },
};

/** «Аналитика · прошлый месяц»: the whole of September against the whole of August. */
export const SEPTEMBER_EXPENSES: MonthAnalytics = {
  ...OCTOBER_EXPENSES,
  month: '2026-09',
  period: { month: '2026-09', from: '2026-09-01', to: '2026-09-30', wholeMonth: true },
  previous: { month: '2026-08', from: '2026-08-01', to: '2026-08-31', wholeMonth: true },
  totalMinor: som(13_250_000),
  previousTotalMinor: som(13_290_000),
  change: { kind: 'same', percent: 0, diffMinor: som(-40_000) },
  categories: [
    row({ categoryId: 'pr', name: 'Продукты', amountMinor: som(4_120_000), count: 13, sharePercent: 31, previousMinor: som(3_900_000), previousCount: 12, change: { kind: 'up', percent: 6, diffMinor: som(220_000) } }),
    row({ categoryId: 'zd', name: 'Здоровье', amountMinor: som(860_000), count: 5, sharePercent: 6, previousMinor: som(520_000), previousCount: 4, change: { kind: 'up', percent: 65, diffMinor: som(340_000) } }),
  ],
  insight: { kind: 'change', categoryId: 'zd', name: 'Здоровье', direction: 'up', diffMinor: som(340_000), amountMinor: som(860_000), previousMinor: som(520_000) },
};

/** «Аналитика · первый месяц»: August, the first month of recording — nothing to compare with. */
export const AUGUST_FIRST_MONTH: MonthAnalytics = {
  ...OCTOBER_EXPENSES,
  month: '2026-08',
  period: { month: '2026-08', from: '2026-08-01', to: '2026-08-31', wholeMonth: true },
  previous: null,
  comparable: false,
  totalMinor: som(13_290_000),
  previousTotalMinor: null,
  change: null,
  categories: [
    row({ categoryId: 'pr', name: 'Продукты', amountMinor: som(3_900_000), count: 12, sharePercent: 29 }),
    row({ categoryId: 'dm', name: 'Дом', amountMinor: som(2_900_000), count: 7, sharePercent: 22 }),
  ],
  insight: { kind: 'largest', categoryId: 'pr', name: 'Продукты', sharePercent: 29 },
};

/** «Аналитика · первые дни»: recording began on 1 October, today is the 3rd. */
export const FIRST_DAYS: MonthAnalytics = {
  ...OCTOBER_EXPENSES,
  today: '2026-10-03',
  firstMonth: '2026-10',
  previous: null,
  firstDays: { days: 3, daysLeft: 4 },
  comparable: false,
  totalMinor: som(2_129_400),
  previousTotalMinor: null,
  change: null,
  categories: [
    row({ categoryId: 'pr', name: 'Продукты', amountMinor: som(648_000), count: 3, sharePercent: 30 }),
    row({ categoryId: 'zd', name: 'Здоровье', amountMinor: som(400_000), count: 1, sharePercent: 19 }),
  ],
  insight: { kind: 'too_early', days: 3, daysLeft: 4 },
};

/** «Аналитика · пока пусто»: nothing recorded yet. */
export const EMPTY: MonthAnalytics = {
  ...FIRST_DAYS,
  firstDays: { days: 0, daysLeft: 7 },
  totalMinor: 0,
  categories: [],
  insight: null,
};

const record = (id: string, day: number, amount: number, description: string, accountId: string, overrides: Partial<Transaction> = {}): Transaction => ({
  id,
  date: `2026-10-${String(day).padStart(2, '0')}`,
  category: 'Кафе',
  categoryId: 'kf',
  description,
  amount,
  amountMinor: som(amount),
  currency: 'UZS',
  accountId,
  type: 'expense',
  userId: 'u',
  createdAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`,
  ...overrides,
});

/** The board's ten operations of «Кафе» in 1–14 October, newest first. */
export const CAFE_RECORDS: Transaction[] = [
  record('k13', 13, 145_000, 'Обед с командой', 'card'),
  record('k11', 11, 25_000, 'Кофе', 'cash'),
  record('k9', 9, 286_000, 'Ужин с друзьями', 'card'),
  record('k8', 8, 28_000, 'Кофе', 'cash'),
  record('k7', 7, 62_000, 'Обед', 'card'),
  record('k6', 6, 25_000, 'Кофе', 'cash'),
  record('k5', 5, 318_000, 'Семейный ужин', 'card'),
  record('k3', 3, 58_000, 'Обед', 'card'),
  record('k2', 2, 25_000, 'Кофе', 'cash'),
  record('k1', 1, 120_000, 'Пицца', 'card'),
];

export { record as cafeRecord };

/** Every day of the period, summed from the records (as the API gives `days`). */
export function daysOf(month: string, last: number, records: readonly Transaction[]): AnalyticsDay[] {
  return Array.from({ length: last }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, '0')}`;
    const own = records.filter((item) => item.date === date);
    return { date, amountMinor: own.reduce((sum, item) => sum + (item.amountMinor ?? 0), 0), count: own.length, hasUsd: false };
  });
}

/** «Аналитика · категория «Кафе»». */
export const CAFE: CategoryAnalytics = {
  month: '2026-10',
  today: '2026-10-14',
  currentMonth: '2026-10',
  firstMonth: '2026-08',
  period: OCTOBER_EXPENSES.period,
  previous: OCTOBER_EXPENSES.previous,
  firstDays: null,
  usd: NO_USD,
  category: { id: 'kf', name: 'Кафе', type: 'expense' },
  comparable: true,
  amountMinor: som(1_092_000),
  count: 10,
  sharePercent: 14,
  hasUsd: false,
  previousMinor: som(780_000),
  change: { kind: 'up', percent: 40, diffMinor: som(312_000) },
  // The current month has all its days; after today they are empty
  days: daysOf('2026-10', 31, CAFE_RECORDS),
  records: CAFE_RECORDS,
};
