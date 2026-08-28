import type { Transaction } from '../types/transaction';
import { isExpense } from './semanticType';

export interface Suggestion {
  description: string;
  amount: number;
  category: string;
  /** Сколько раз такая трата уже была: «12 раз в этом месяце» осмысленнее даты. */
  count: number;
  date: string;
}

const MAX = 3;

/**
 * Подсказки из уже загруженной истории.
 *
 * Ни запроса к серверу, ни размороженного обучения: GET /transactions/user/:id
 * возвращает всю историю одним массивом, и поиск идёт локально. То, что в плане
 * записано как недостаток контракта (нет пагинации), здесь оказалось
 * преимуществом.
 *
 * Когда история дорастёт до тысяч записей, отдавать её целиком станет дорого
 * и подсказки придётся перенести на сервер — репозиторный
 * findByUserId(userId, limit?) лимит уже поддерживает.
 */
export function suggestFromHistory(history: Transaction[], query: string): Suggestion[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const byKey = new Map<string, Suggestion>();

  for (const tx of history) {
    // Не-расходы не предлагаем: переводы и зарплату руками не добавляют.
    if (!isExpense(tx)) continue;

    const description = tx.description ?? '';
    const haystack = description.toLowerCase();

    // Совпадение по началу любого слова, а не по любому месту строки:
    // иначе «фе» вытаскивало бы «Кофе», и подсказки шумели бы на каждой букве.
    const matches =
      haystack.startsWith(needle) ||
      haystack.split(/[\s,.:;—-]+/).some((word) => word.startsWith(needle));
    if (!matches) continue;

    const key = haystack;
    const seen = byKey.get(key);

    if (!seen) {
      byKey.set(key, { description, amount: tx.amount, category: tx.category, count: 1, date: tx.date });
      continue;
    }

    seen.count += 1;
    // Самая свежая запись задаёт сумму и категорию: привычки меняются.
    if (tx.date > seen.date) {
      seen.description = description;
      seen.amount = tx.amount;
      seen.category = tx.category;
      seen.date = tx.date;
    }
  }

  return [...byKey.values()].sort((a, b) => b.count - a.count || (a.date < b.date ? 1 : -1)).slice(0, MAX);
}
