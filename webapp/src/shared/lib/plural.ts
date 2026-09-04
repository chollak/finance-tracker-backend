/**
 * Russian plural agreement (one / few / many).
 *
 * Rules:
 * - one:  1, 21, 101, 131 …            (last digit 1, but not 11)
 * - few:  2–4, 22–24, 102–104 …        (last digit 2–4, but not 12–14)
 * - many: 0, 5–20, 25–30, 111–114 …    (everything else, incl. the 11–14 exception)
 */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;

  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** `pluralRu` prefixed with the number itself: `3 транзакции` */
export function pluralWithCount(count: number, one: string, few: string, many: string): string {
  return `${count} ${pluralRu(count, one, few, many)}`;
}

export function pluralDays(count: number): string {
  return pluralRu(count, 'день', 'дня', 'дней');
}

export function pluralBudgets(count: number): string {
  return pluralRu(count, 'бюджет', 'бюджета', 'бюджетов');
}

export function pluralTransactions(count: number): string {
  return pluralRu(count, 'транзакция', 'транзакции', 'транзакций');
}

export function pluralDebts(count: number): string {
  return pluralRu(count, 'долг', 'долга', 'долгов');
}

/** «1 активный долг» / «2 активных долга» / «5 активных долгов» */
export function pluralActiveDebts(count: number): string {
  return pluralRu(count, 'активный долг', 'активных долга', 'активных долгов');
}

export function pluralCategories(count: number): string {
  return pluralRu(count, 'категория', 'категории', 'категорий');
}

export function pluralVoiceInputs(count: number): string {
  return pluralRu(count, 'голосовое сообщение', 'голосовых сообщения', 'голосовых сообщений');
}
