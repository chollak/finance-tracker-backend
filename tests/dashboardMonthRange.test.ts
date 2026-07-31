import { getCurrentMonthDashboardRange } from '../webapp/src/entities/dashboard/api/monthRange';

describe('getCurrentMonthDashboardRange', () => {
  it('returns an ISO date range from the first day of the current month through the first day of next month', () => {
    const range = getCurrentMonthDashboardRange(new Date('2026-07-31T12:34:56.000Z'));

    expect(range).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-08-01',
    });
  });

  it('rolls December into January of the next year', () => {
    const range = getCurrentMonthDashboardRange(new Date('2026-12-15T12:00:00.000Z'));

    expect(range).toEqual({
      startDate: '2026-12-01',
      endDate: '2027-01-01',
    });
  });
});
