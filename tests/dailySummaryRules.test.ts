import {
  daySummaryOf,
  isSummaryDue,
  localClock,
  monthSummaryOf,
  MonthExpenses,
} from '../src/modules/notification/domain/dailySummary';

/** FT-124: when the daily summary is due on the user's clock and what it says, from the totals of FT-103. */
describe('daily summary rules (FT-124)', () => {
  describe('the user\'s clock', () => {
    it('reads the moment in Tashkent by default', () => {
      expect(localClock(new Date('2026-10-14T16:00:00.000Z'), 'Asia/Tashkent')).toEqual({ date: '2026-10-14', time: '21:00' });
      expect(localClock(new Date('2026-10-14T19:30:00.000Z'), undefined)).toEqual({ date: '2026-10-15', time: '00:30' });
    });

    it('follows the user\'s own time zone', () => {
      // 21:00 in Moscow is 23:00 in Tashkent
      expect(localClock(new Date('2026-10-14T18:00:00.000Z'), 'Europe/Moscow')).toEqual({ date: '2026-10-14', time: '21:00' });
    });

    it('reads an unknown time zone as Tashkent', () => {
      expect(localClock(new Date('2026-10-14T16:00:00.000Z'), 'Mars/Olympus')).toEqual({ date: '2026-10-14', time: '21:00' });
    });

    it('is due from the chosen time until the day ends', () => {
      expect(isSummaryDue({ date: '2026-10-14', time: '20:59' }, '21:00')).toBe(false);
      expect(isSummaryDue({ date: '2026-10-14', time: '21:00' }, '21:00')).toBe(true);
      expect(isSummaryDue({ date: '2026-10-14', time: '23:59' }, '21:00')).toBe(true);
      expect(isSummaryDue({ date: '2026-10-14', time: '21:30' }, '22:00')).toBe(false);
    });
  });

  describe('what it says', () => {
    const analytics: MonthExpenses = {
      month: '2026-10',
      today: '2026-10-14',
      totalMinor: 768_440_000,
      comparable: true,
      change: { diffMinor: 71_440_000 },
      previous: { month: '2026-09', to: '2026-09-14', wholeMonth: false },
      categories: [
        { name: 'Продукты', amountMinor: 214_000_000 },
        { name: 'Дом', amountMinor: 145_000_000 },
        { name: 'Кафе', amountMinor: 109_200_000 },
        { name: 'Покупки', amountMinor: 106_000_000 },
        // Only in September: nothing spent this month
        { name: 'Подарки', amountMinor: 0 },
      ],
      usd: { missingRate: false },
    };

    it('the month: the total, the comparison with the same days before, the 3 largest categories', () => {
      expect(monthSummaryOf(analytics)).toEqual({
        month: '2026-10',
        today: '2026-10-14',
        totalMinor: 768_440_000,
        comparison: { diffMinor: 71_440_000, previous: { month: '2026-09', to: '2026-09-14', wholeMonth: false } },
        categories: [
          { name: 'Продукты', amountMinor: 214_000_000 },
          { name: 'Дом', amountMinor: 145_000_000 },
          { name: 'Кафе', amountMinor: 109_200_000 },
        ],
        usdLeftOut: false,
      });
    });

    it('no comparison while analytics has none (first days, an empty month before)', () => {
      expect(monthSummaryOf({ ...analytics, comparable: false, change: null }).comparison).toBeNull();
    });

    it('the day: the total, how many expenses, up to 3 categories', () => {
      const month = monthSummaryOf(analytics);
      const day = daySummaryOf('2026-10-14', {
        recordCount: 5,
        expenseMinor: 21_040_000 + 600_000,
        categories: [
          { category: 'Продукты', amountMinor: 18_640_000, count: 1 },
          { category: 'Транспорт', amountMinor: 2_400_000, count: 1 },
          { category: 'Кафе', amountMinor: 400_000, count: 1 },
          { category: 'Связь', amountMinor: 200_000, count: 1 },
        ],
        usd: { missingRate: true },
      }, month);

      expect(day).toEqual({
        day: '2026-10-14',
        recordCount: 5,
        expenseMinor: 21_640_000,
        expenseCount: 4,
        categories: [
          { name: 'Продукты', amountMinor: 18_640_000 },
          { name: 'Транспорт', amountMinor: 2_400_000 },
          { name: 'Кафе', amountMinor: 400_000 },
        ],
        usdLeftOut: true,
        month,
      });
    });
  });
});
