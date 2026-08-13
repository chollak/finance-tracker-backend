/** [1, 2–4, 5+] — the three Russian count forms, in that order. */
export type PluralForms = readonly [one: string, few: string, many: string];

/**
 * Picks the Russian word form for a count.
 *
 * The last digit decides, except in the teens, where 11–14 all take the
 * "many" form despite ending in 1–4.
 */
export function plural(count: number, forms: PluralForms): string {
  const n = Math.abs(Math.trunc(count));
  const lastTwo = n % 100;
  const lastOne = n % 10;

  if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
  if (lastOne === 1) return forms[0];
  if (lastOne >= 2 && lastOne <= 4) return forms[1];
  return forms[2];
}

/** Same, with the number in front: "3 бюджета". */
export function pluralWithCount(count: number, forms: PluralForms): string {
  return `${count} ${plural(count, forms)}`;
}

/** Nouns the interface counts. Keeping them together stops each screen inventing its own. */
export const PLURALS = {
  budget: ['бюджет', 'бюджета', 'бюджетов'],
  debt: ['долг', 'долга', 'долгов'],
  transaction: ['транзакция', 'транзакции', 'транзакций'],
  category: ['категория', 'категории', 'категорий'],
  voiceInput: ['голосовое сообщение', 'голосовых сообщения', 'голосовых сообщений'],
  day: ['день', 'дня', 'дней'],
} as const satisfies Record<string, PluralForms>;
