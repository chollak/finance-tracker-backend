/**
 * Календарный день системы — UTC-день.
 *
 * normalizeTransactionDate на бэкенде везде использует toISOString().split('T')[0],
 * и стоит она в CreateTransactionUseCase — единственном входе для всех записей.
 * Значит запись, сделанная в Ташкенте в 02:00 (UTC 21:00 предыдущего дня),
 * получит вчерашнюю дату.
 *
 * Клиент, считающий по локали браузера, потеряет её из сегодняшнего столбика —
 * человек только что добавил трату и не видит её в графике.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { todayUtc, monthPrefix, shiftDay, lastSevenDates } from './dates';

afterEach(() => {
  vi.useRealTimers();
});

describe('сегодня по UTC', () => {
  it('берёт UTC-день, а не локальный', () => {
    // 02:00 в Ташкенте (UTC+5) — это 21:00 предыдущего дня по UTC.
    vi.useFakeTimers().setSystemTime(new Date('2026-08-27T21:00:00.000Z'));

    expect(todayUtc()).toBe('2026-08-27');
  });

  it('на границе суток не перескакивает вперёд', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-27T23:59:59.999Z'));

    expect(todayUtc()).toBe('2026-08-27');
  });

  it('сразу после полуночи UTC даёт новый день', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-28T00:00:00.001Z'));

    expect(todayUtc()).toBe('2026-08-28');
  });
});

describe('месяц', () => {
  it('это префикс строки даты', () => {
    expect(monthPrefix('2026-08-27')).toBe('2026-08');
  });
});

describe('сдвиг дня', () => {
  it('шагает назад через границу месяца', () => {
    expect(shiftDay('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('шагает назад через границу года', () => {
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('учитывает високосный февраль', () => {
    expect(shiftDay('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('шагает вперёд', () => {
    expect(shiftDay('2026-08-31', 1)).toBe('2026-09-01');
  });
});

describe('семь дат подряд', () => {
  it('заканчивается сегодняшним днём', () => {
    expect(lastSevenDates('2026-08-27')).toEqual([
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
    ]);
  });
});
