import { describe, expect, it } from 'vitest';
import { addDays, dayMonth, monthGrid, monthNavigation, monthTitle, relativeDayLabel, shiftMonth, toLocalDate } from './localDate';

describe('local dates', () => {
  it('formats and moves days without time zones', () => {
    expect(toLocalDate(new Date(2026, 9, 16, 23, 59))).toBe('2026-10-16');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('names days and months in Russian', () => {
    expect(monthTitle(2026, 10)).toBe('Октябрь 2026');
    expect(dayMonth('2026-10-14')).toBe('14 октября');
    expect(relativeDayLabel('2026-10-16', '2026-10-16')).toBe('Сегодня');
    expect(relativeDayLabel('2026-10-15', '2026-10-16')).toBe('Вчера');
    expect(relativeDayLabel('2026-10-14', '2026-10-16')).toBe('14 октября');
  });

  it('lays out a month from Monday and marks today and future days', () => {
    const weeks = monthGrid(2026, 10, '2026-10-16');
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null]); // 1 October 2026 is a Thursday
    expect(weeks[0][3]?.date).toBe('2026-10-01');
    const cells = weeks.flat().filter(Boolean);
    expect(cells).toHaveLength(31);
    expect(cells.find((cell) => cell!.isToday)?.date).toBe('2026-10-16');
    expect(cells.filter((cell) => cell!.isFuture)).toHaveLength(15);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it('browses 12 months back and never past the current month', () => {
    expect(monthNavigation(2026, 10, '2026-10-16')).toEqual({ canPrev: true, canNext: false });
    expect(monthNavigation(2025, 11, '2026-10-16')).toEqual({ canPrev: true, canNext: true });
    expect(monthNavigation(2025, 10, '2026-10-16')).toEqual({ canPrev: false, canNext: true });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
});
