import {
  ANALYTICS_RULES,
  analyticsPeriods,
  buildMonthAnalytics,
  changeOf,
  sharesOf,
  trackingDaysOf,
} from '../src/modules/transaction/domain/monthAnalytics';
import { summarizePeriod } from '../src/modules/transaction/domain/periodTotals';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';

const sum = (value: number) => value * 100;

/** A record of the user's: «expense» unless said otherwise, amount in whole сум. */
function rec(date: string, categoryId: string, amount: number, overrides: Partial<Transaction> = {}): Transaction {
  const type = overrides.type ?? 'expense';
  return {
    userId: 'user-1', date, categoryId, category: categoryId, description: 'x', type, semanticType: type,
    amount, amountMinor: sum(amount), currency: 'UZS', ...overrides,
  };
}

/** `count` records of one category on consecutive days from `fromDay`, each `amount` сум. */
function many(month: string, categoryId: string, count: number, amount: number, fromDay = 1, overrides: Partial<Transaction> = {}) {
  return Array.from({ length: count }, (_, i) => rec(`${month}-${String(fromDay + i).padStart(2, '0')}`, categoryId, amount, overrides));
}

const totals = (records: Transaction[], usdRateMinor: number | null = null) => summarizePeriod(records, { usdRateMinor });

/** FT-120: the analytics rules of design-system «Аналитика», with nothing read from a database. */
describe('month analytics rules (FT-120)', () => {
  describe('periods: the current month against the same days, past months whole', () => {
    it('compares 1–14 October with 1–14 September while October goes on', () => {
      const { period, previous } = analyticsPeriods({ month: '2026-10', today: '2026-10-14', type: 'expense', firstMonth: '2026-08' });
      expect(period).toEqual({ month: '2026-10', from: '2026-10-01', to: '2026-10-14', wholeMonth: false });
      expect(previous).toEqual({ month: '2026-09', from: '2026-09-01', to: '2026-09-14', wholeMonth: false });
    });

    it('compares a past month with the whole month before it', () => {
      const { period, previous } = analyticsPeriods({ month: '2026-09', today: '2026-10-14', type: 'expense', firstMonth: '2026-08' });
      expect(period).toEqual({ month: '2026-09', from: '2026-09-01', to: '2026-09-30', wholeMonth: true });
      expect(previous).toEqual({ month: '2026-08', from: '2026-08-01', to: '2026-08-31', wholeMonth: true });
    });

    it('compares income of an unfinished month with the whole previous month', () => {
      const { period, previous } = analyticsPeriods({ month: '2026-10', today: '2026-10-14', type: 'income', firstMonth: '2026-08' });
      expect(period.to).toBe('2026-10-14');
      expect(previous).toEqual({ month: '2026-09', from: '2026-09-01', to: '2026-09-30', wholeMonth: true });
    });

    it('stops the same days at the end of a shorter month, and crosses the year', () => {
      expect(analyticsPeriods({ month: '2027-03', today: '2027-03-30', type: 'expense', firstMonth: '2026-01' }).previous)
        .toEqual({ month: '2027-02', from: '2027-02-01', to: '2027-02-28', wholeMonth: true });
      expect(analyticsPeriods({ month: '2027-01', today: '2027-01-05', type: 'expense', firstMonth: '2026-01' }).previous)
        .toEqual({ month: '2026-12', from: '2026-12-01', to: '2026-12-05', wholeMonth: false });
    });

    it('has nothing to compare the first month of recording with', () => {
      expect(analyticsPeriods({ month: '2026-08', today: '2026-10-14', type: 'expense', firstMonth: '2026-08' }).previous).toBeNull();
    });

    it('counts recording days from the first record, today included', () => {
      expect(trackingDaysOf('2026-10-01', '2026-10-03')).toBe(3);
      expect(trackingDaysOf('2026-08-01', '2026-10-14')).toBe(75);
      expect(trackingDaysOf(null, '2026-10-14')).toBe(0);
    });
  });

  describe('shares', () => {
    it('add up to exactly 100%', () => {
      expect(sharesOf([1, 1, 1])).toEqual([34, 33, 33]);
      expect(sharesOf([sum(2140000), sum(1450000), sum(1092000), sum(1060000), sum(742400), sum(520000), sum(380000), sum(300000)])
        .reduce((a, b) => a + b, 0)).toBe(100);
      // 2/3 and 1/3: the larger remainder gets the point
      expect(sharesOf([2, 1])).toEqual([67, 33]);
    });

    it('are 0 for nothing and when there is nothing in total', () => {
      expect(sharesOf([5, 0])).toEqual([100, 0]);
      expect(sharesOf([0, 0])).toEqual([0, 0]);
      expect(sharesOf([])).toEqual([]);
    });
  });

  describe('change against the previous period', () => {
    it('goes up, down, stays «как было» or is new', () => {
      expect(changeOf(sum(1092000), sum(780000))).toEqual({ kind: 'up', percent: 40, diffMinor: sum(312000) });
      expect(changeOf(sum(520000), sum(612000))).toEqual({ kind: 'down', percent: 15, diffMinor: sum(-92000) });
      expect(changeOf(sum(1450000), sum(1448000))).toEqual({ kind: 'same', percent: 0, diffMinor: sum(2000) });
      expect(changeOf(sum(100000), 0)).toEqual({ kind: 'new', percent: null, diffMinor: sum(100000) });
    });

    it('never falls for income of an unfinished month: «пока нет», «пока 60%»', () => {
      expect(changeOf(0, sum(180000), { soFar: true })).toEqual({ kind: 'not_yet', percent: 0, diffMinor: sum(-180000) });
      expect(changeOf(sum(6000), sum(10000), { soFar: true })).toEqual({ kind: 'so_far', percent: 60, diffMinor: sum(-4000) });
      // More than the whole previous month is growth as usual
      expect(changeOf(sum(3795000), sum(2530000), { soFar: true })).toEqual({ kind: 'up', percent: 50, diffMinor: sum(1265000) });
      expect(changeOf(sum(12500000), sum(12500000), { soFar: true })).toMatchObject({ kind: 'same' });
    });
  });

  describe('the insight', () => {
    const october = (records: Transaction[], prior: Transaction[], options: Partial<Parameters<typeof buildMonthAnalytics>[0]> = {}) => {
      const { period, previous } = analyticsPeriods({ month: '2026-10', today: '2026-10-14', type: options.type ?? 'expense', firstMonth: '2026-08' });
      return buildMonthAnalytics({
        type: 'expense', period, previous, trackingDays: 75, current: totals(records), prior: previous ? totals(prior) : null, ...options,
      });
    };

    it('names the biggest growth among categories with 3 operations in both periods', () => {
      const result = october(
        [...many('2026-10', 'cafe', 4, 50000), ...many('2026-10', 'food', 3, 100000), ...many('2026-10', 'home', 1, 900000)],
        [...many('2026-09', 'cafe', 3, 40000), ...many('2026-09', 'food', 3, 90000), ...many('2026-09', 'home', 1, 100000)]
      );
      // «Дом» grew most (+800 000) but with one operation; «Кафе» +80 000 beats «Продукты» +30 000
      expect(result.insight).toEqual({
        kind: 'change', categoryId: 'cafe', name: 'cafe', direction: 'up',
        diffMinor: sum(80000), amountMinor: sum(200000), previousMinor: sum(120000),
      });
    });

    it('names the biggest decline when nothing grew', () => {
      const result = october(
        [...many('2026-10', 'cafe', 3, 30000), ...many('2026-10', 'food', 3, 50000)],
        [...many('2026-09', 'cafe', 3, 40000), ...many('2026-09', 'food', 3, 90000)]
      );
      expect(result.insight).toMatchObject({ kind: 'change', categoryId: 'food', direction: 'down', diffMinor: sum(120000) });
    });

    it('falls back to the largest category when no category has 3 operations in both periods', () => {
      const result = october(
        [...many('2026-10', 'cafe', 2, 30000), ...many('2026-10', 'food', 3, 100000)],
        [...many('2026-09', 'cafe', 3, 10000), ...many('2026-09', 'food', 2, 10000)]
      );
      expect(result.insight).toEqual({ kind: 'largest', categoryId: 'food', name: 'food', sharePercent: 83 });
    });

    it('takes income categories whatever their count, and never names a fall of an unfinished month', () => {
      const income = (month: string, cat: string, amount: number, day = 13) => rec(`${month}-${day}`, cat, amount, { type: 'income' });
      const grew = october(
        [income('2026-10', 'salary', 12500000), income('2026-10', 'freelance', 3795000)],
        [income('2026-09', 'salary', 12500000), income('2026-09', 'freelance', 2530000, 25), income('2026-09', 'cashback', 180000, 30)],
        { type: 'income' }
      );
      expect(grew.insight).toMatchObject({ kind: 'change', categoryId: 'freelance', direction: 'up', diffMinor: sum(1265000) });

      const fell = october(
        [income('2026-10', 'salary', 12500000)],
        [income('2026-09', 'salary', 12500000), income('2026-09', 'freelance', 2530000, 25)],
        { type: 'income' }
      );
      expect(fell.insight).toEqual({ kind: 'largest', categoryId: 'salary', name: 'salary', sharePercent: 100 });
      expect(fell.categories.find(row => row.categoryId === 'freelance')!.change).toMatchObject({ kind: 'not_yet' });
    });

    it('says a new income category was not there before', () => {
      const income = (month: string, cat: string, amount: number) => rec(`${month}-10`, cat, amount, { type: 'income' });
      const result = october([income('2026-10', 'salary', 1000), income('2026-10', 'gift', 500000)], [income('2026-09', 'salary', 1000)], { type: 'income' });
      expect(result.insight).toEqual({ kind: 'new', categoryId: 'gift', name: 'gift', amountMinor: sum(500000) });
    });

    it('gives no insight and no comparison in the first 7 days of recording', () => {
      const result = october(many('2026-10', 'food', 3, 100000), many('2026-09', 'food', 3, 50000), { trackingDays: 3 });
      expect(ANALYTICS_RULES.firstDays).toBe(7);
      expect(result.insight).toEqual({ kind: 'too_early', days: 3, daysLeft: 4 });
      expect(result.comparable).toBe(false);
      expect(result.change).toBeNull();
      expect(result.categories.map(row => [row.categoryId, row.change, row.sharePercent])).toEqual([['food', null, 100]]);
    });

    it('names the largest share in the first month of recording', () => {
      const { period } = analyticsPeriods({ month: '2026-08', today: '2026-10-14', type: 'expense', firstMonth: '2026-08' });
      const result = buildMonthAnalytics({
        type: 'expense', period, previous: null, trackingDays: 75, prior: null,
        current: totals([...many('2026-08', 'food', 3, 1300000), ...many('2026-08', 'home', 2, 1450000), rec('2026-08-31', 'cafe', 610000)]),
      });
      expect(result.comparable).toBe(false);
      expect(result.insight).toEqual({ kind: 'largest', categoryId: 'food', name: 'food', sharePercent: 53 });
    });

    it('has no insight without records', () => {
      expect(october([], many('2026-09', 'food', 3, 50000)).insight).toBeNull();
    });
  });

  describe('category rows', () => {
    it('sort by the period, add categories only from the previous period at the end, mark dollars', () => {
      const result = october();
      expect(result.categories.map(row => [row.categoryId, row.amountMinor, row.previousMinor, row.sharePercent, row.hasUsd, row.change?.kind]))
        .toEqual([
          ['food', sum(300000), sum(270000), 60, false, 'up'],
          ['cafe', sum(200000), sum(120000), 40, true, 'up'],
          ['gifts', 0, sum(50000), 0, false, 'down'],
        ]);
      expect(result.totalMinor).toBe(sum(500000));
      expect(result.hasUsd).toBe(true);
      expect(result.previousTotalMinor).toBe(sum(440000));
      expect(result.change).toEqual({ kind: 'up', percent: 14, diffMinor: sum(60000) });

      function october() {
        const { period, previous } = analyticsPeriods({ month: '2026-10', today: '2026-10-14', type: 'expense', firstMonth: '2026-08' });
        // 10,00 USD at 10 000 сум = 100 000 сум
        const dollars = rec('2026-10-02', 'cafe', 10, { amountMinor: 1000, currency: 'USD' });
        return buildMonthAnalytics({
          type: 'expense', period, previous, trackingDays: 75,
          current: totals([...many('2026-10', 'food', 3, 100000), rec('2026-10-01', 'cafe', 100000), dollars], 1000000),
          prior: totals([...many('2026-09', 'food', 3, 90000), ...many('2026-09', 'cafe', 3, 40000), rec('2026-09-05', 'gifts', 50000)], 1000000),
        });
      }
    });
  });
});
