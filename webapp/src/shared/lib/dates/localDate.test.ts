import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayGroupLabel,
  dayMonth,
  monthBounds,
  monthGrid,
  monthNameIn,
  monthNameLower,
  monthNavigation,
  monthTitle,
  relativeDayLabel,
  shiftMonth,
  toLocalDate,
} from './localDate';

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

  it('gives the first and the last day of the month of a date', () => {
    expect(monthBounds('2026-10-19')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthBounds('2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthBounds('2028-02-29')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('names a month for «за октябрь» and «в октябре»', () => {
    expect(monthNameLower(10)).toBe('октябрь');
    expect(monthNameLower(5)).toBe('май');
    expect(monthNameIn(10)).toBe('октябре');
    expect(monthNameIn(5)).toBe('мае');
    expect(monthNameIn(8)).toBe('августе');
  });

  it('labels a day group of a list: «Сегодня», «Вчера», then the weekday and the date', () => {
    expect(dayGroupLabel('2026-10-19', '2026-10-19')).toBe('Сегодня');
    expect(dayGroupLabel('2026-10-18', '2026-10-19')).toBe('Вчера');
    expect(dayGroupLabel('2026-10-12', '2026-10-19')).toBe('Понедельник, 12 октября');
    expect(dayGroupLabel('2026-10-17', '2026-10-19')).toBe('Суббота, 17 октября');
    expect(dayGroupLabel('2025-12-31', '2026-10-19')).toBe('Среда, 31 декабря 2025');
  });
});
