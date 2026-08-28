/**
 * Даты. Календарный день системы — UTC-день, и это не выбор, а факт бэкенда:
 * normalizeTransactionDate везде использует toISOString().split('T')[0],
 * а стоит она в CreateTransactionUseCase — единственном входе для всех записей.
 *
 * Отсюда правило: даты сравниваются СТРОКАМИ, никогда через
 * new Date(tx.date).getDate(). Строка '2026-08-27' при разборе становится
 * полуночью UTC, и в браузере с UTC+5 локальные геттеры съезжают на день.
 */

/** Сегодняшний календарный день по UTC. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Месяц как префикс: '2026-08-27' → '2026-08'. */
export function monthPrefix(date: string): string {
  return date.slice(0, 7);
}

/** Сдвиг на N дней. Арифметика в UTC, поэтому границы месяца и года честные. */
export function shiftDay(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00.000Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** Семь дат подряд, заканчивая переданной. */
export function lastSevenDates(today: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6));
}
