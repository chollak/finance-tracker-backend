import { dayRanges, daysBetween, isDay, streaksOf, tashkentDay, weekdayOf } from '../scripts/capture-quality/period';

/** Calendar helpers of the capture quality report (FT-217): Tashkent days and runs of days with records. */
describe('capture quality report: period (FT-217)', () => {
  it('reads a moment as a day on the Tashkent calendar, UTC+5', () => {
    expect(tashkentDay(new Date('2026-10-30T18:59:00Z'))).toBe('2026-10-30');
    expect(tashkentDay(new Date('2026-10-30T19:00:00Z'))).toBe('2026-10-31');
    expect(tashkentDay(new Date('2026-11-14T18:59:59Z'))).toBe('2026-11-14');
  });

  it('lists the days of a period, both ends included', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(daysBetween('2026-11-02', '2026-11-01')).toEqual([]);
  });

  it('knows a calendar day and its weekday', () => {
    expect(isDay('2026-10-31')).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('31.10.2026')).toBe(false);
    expect(weekdayOf('2026-10-31')).toBe('сб');
    expect(weekdayOf('2026-11-02')).toBe('пн');
  });

  it('finds the longest run and the one that ends the period', () => {
    const days = daysBetween('2026-11-01', '2026-11-07');
    const recorded = new Set(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-07']);
    expect(streaksOf(days, recorded, '2026-11-20')).toEqual({ longest: 3, current: 3, todayPending: false });
  });

  it('does not break the current run on today without records yet', () => {
    const days = daysBetween('2026-11-01', '2026-11-04');
    const recorded = new Set(['2026-11-02', '2026-11-03']);
    expect(streaksOf(days, recorded, '2026-11-04')).toEqual({ longest: 2, current: 2, todayPending: true });
  });

  it('ends the current run on a past day without records', () => {
    const days = daysBetween('2026-11-01', '2026-11-04');
    const recorded = new Set(['2026-11-01', '2026-11-02']);
    expect(streaksOf(days, recorded, '2026-11-10')).toEqual({ longest: 2, current: 0, todayPending: false });
  });

  it('writes days as ranges of consecutive ones', () => {
    expect(dayRanges(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-07', '2026-10-08']))
      .toEqual(['2026-10-01 — 2026-10-03', '2026-10-05', '2026-10-07 — 2026-10-08']);
    expect(dayRanges([])).toEqual([]);
  });

  it('has no runs without days', () => {
    expect(streaksOf([], new Set(), '2026-11-10')).toEqual({ longest: 0, current: 0, todayPending: false });
  });
});
