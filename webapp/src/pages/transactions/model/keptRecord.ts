import type { Transaction } from '@/shared/types';

/** Newest first, as History lists records: by date, then by the time of writing. */
function isNewer(a: Transaction, b: Transaction): boolean {
  return a.date > b.date || (a.date === b.date && (a.createdAt ?? '') > (b.createdAt ?? ''));
}

/**
 * FilterChips.md: «Запись, которую только что исправили, остаётся в списке, пока фильтр не поменяют». The list as
 * the server found it, with the record just opened put back where its date puts it if the filter no longer finds it
 * after the change; while the filter still finds it, the list's copy is shown.
 */
export function withKeptRecord(items: Transaction[], kept: Transaction | undefined): Transaction[] {
  if (!kept || items.some((item) => item.id === kept.id)) return items;
  const at = items.findIndex((item) => isNewer(kept, item));
  return at === -1 ? [...items, kept] : [...items.slice(0, at), kept, ...items.slice(at)];
}
