import { visibleAccounts, type Account } from '@/entities/account';
import { pickableCategories, type Category } from '@/entities/category';
import { formatNetMinor, type HistoryQuery, type HistorySummary } from '@/entities/transaction';
import { pluralWithCount } from '@/shared/lib/plural';
import type { PickerCategory } from '@/shared/ui/pastel';

/** History as it opens: no search, no filter. */
export const NO_FILTERS: HistoryQuery = { text: '', categoryId: null, accountId: null, type: null };

/**
 * The type filter (FT-116 Definition of Done: «чипы фильтров (категория, счёт, тип) через Picker»): the chip's name
 * when off, the picker's title and its choices — both kinds, only expenses, only income.
 */
export const TYPE_FILTER = {
  chip: 'Тип',
  title: 'Тип операции',
  options: [
    { id: 'all', name: 'Все', type: null },
    { id: 'expense', name: 'Расходы', type: 'expense' },
    { id: 'income', name: 'Доходы', type: 'income' },
  ],
} as const satisfies { chip: string; title: string; options: ReadonlyArray<{ id: string; name: string; type: HistoryQuery['type'] }> };

/** What the type chip says: «Тип» while both kinds are shown, «Расходы» or «Доходы» once one is chosen. */
export function typeChipLabel(type: HistoryQuery['type']): string {
  return TYPE_FILTER.options.find((option) => option.type === type && type !== null)?.name ?? TYPE_FILTER.chip;
}

/**
 * The account chips: the visible accounts in their order. A hidden account is not offered, but once History is
 * narrowed by it (its record opened from the account screen, FT-118) its chip stays at the end, on, so it can be let
 * go: its operations stay in History (design-system «Скрыть, а не удалить»).
 */
export function accountFilterChips(accounts: readonly Account[] | undefined, chosenId: string | null): Account[] {
  const visible = visibleAccounts(accounts);
  const chosen = chosenId ? accounts?.find((account) => account.id === chosenId && account.isHidden) : undefined;
  return chosen ? [...visible, chosen] : visible;
}

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
export function nothingFoundText(searched: {
  text: string;
  category: string | null;
  account: string | null;
  type?: HistoryQuery['type'];
}): string {
  const parts: string[] = [];
  const text = searched.text.trim();
  if (text) parts.push(`по запросу «${text}»`);
  if (searched.category) parts.push(`в категории «${searched.category}»`);
  if (searched.account) parts.push(`на счёте «${searched.account}»`);
  if (searched.type) parts.push(searched.type === 'income' ? 'среди доходов' : 'среди расходов');
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
