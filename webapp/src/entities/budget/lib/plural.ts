/**
 * Russian plural forms helper (one / few / many)
 * e.g. 1 день, 2 дня, 5 дней
 */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function pluralDays(count: number): string {
  return pluralRu(count, 'день', 'дня', 'дней');
}

export function pluralBudgets(count: number): string {
  return pluralRu(count, 'бюджет', 'бюджета', 'бюджетов');
}
