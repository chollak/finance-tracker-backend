import { pickableCategories, type Category } from '@/entities/category';
import { formatNetMinor, type HistoryQuery, type HistorySummary } from '@/entities/transaction';
import { pluralWithCount } from '@/shared/lib/plural';
import type { PickerCategory } from '@/shared/ui/pastel';

/** History as it opens: no search, no filter. */
export const NO_FILTERS: HistoryQuery = { text: '', categoryId: null, accountId: null };

/** EmptyState.md: the search or the filters found nothing. */
export const NOTHING_FOUND_TITLE = 'Ничего не нашлось';

/** EmptyState.md: no records yet — no reset, the text leads to the first record. */
export const EMPTY_HISTORY = {
  title: 'Пока нет операций',
  text: 'Запишите первую трату на главной — она появится здесь.',
} as const;

/**
 * The line under the chips (FilterChips.md): how many records the search found, all pages, and their sum in сум —
 * «2 операции · −109 000 сум», «≈» with dollars; without a rate for them only how many.
 */
export function resultLine(summary: HistorySummary): string {
  const count = pluralWithCount(summary.count, 'операция', 'операции', 'операций');
  const sum = formatNetMinor(summary);
  return sum ? `${count} · ${sum}` : count;
}

/**
 * What an empty result says (EmptyState.md, board «История · ничего не найдено»): what was searched, then the way
 * out — «Ничего нет по запросу «такси», на счёте «Доллары». Попробуйте другое слово или снимите фильтр.»
 */
export function nothingFoundText(searched: { text: string; category: string | null; account: string | null }): string {
  const parts: string[] = [];
  const text = searched.text.trim();
  if (text) parts.push(`по запросу «${text}»`);
  if (searched.category) parts.push(`в категории «${searched.category}»`);
  if (searched.account) parts.push(`на счёте «${searched.account}»`);
  return `Ничего нет ${parts.join(', ')}. Попробуйте другое слово или снимите фильтр.`;
}

/**
 * The category filter (Picker.md): after «Все категории» the groups «Расходы» and «Доходы» — the visible categories
 * of each kind in their order, «Другое» last. A kind without categories is left out.
 */
export function categoryFilterGroups(categories: readonly Category[] | undefined): Array<{ label: string; categories: PickerCategory[] }> {
  const groups = [
    { label: 'Расходы', categories: pickableCategories(categories, 'expense') },
    { label: 'Доходы', categories: pickableCategories(categories, 'income') },
  ];
  return groups
    .filter((group) => group.categories.length > 0)
    .map((group) => ({
      label: group.label,
      categories: group.categories.map(({ id, name, color }) => ({ id, name, color })),
    }));
}
