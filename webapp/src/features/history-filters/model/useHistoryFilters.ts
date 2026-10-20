import { useState } from 'react';
import type { HistoryQuery } from '@/entities/transaction';
import { useDebounce } from '@/shared/hooks';
import { NO_FILTERS } from './historyFilters';

/**
 * How long typing may pause before History is searched: the result follows every character (SearchField.md, no
 * «Найти»), without a request per keystroke.
 */
export const SEARCH_DELAY_MS = 250;

export interface HistoryFiltersModel {
  /** What is in the search field now. */
  text: string;
  /** What History is narrowed by: the search as it settled, the category and the account at once. */
  query: HistoryQuery;
  setText: (text: string) => void;
  /** A category of the filter, or null for «Все категории». */
  chooseCategory: (categoryId: string | null) => void;
  /** An account chip: a press turns it on, another one off; one account at a time. */
  toggleAccount: (accountId: string) => void;
  /** «Сбросить», «Сбросить поиск и фильтры»: no search, no filter, at once. */
  reset: () => void;
}

/** The search and the filter chips of History (FT-116, FilterChips.md). */
export function useHistoryFilters(): HistoryFiltersModel {
  const [text, setText] = useState(NO_FILTERS.text);
  const [categoryId, setCategoryId] = useState<string | null>(NO_FILTERS.categoryId);
  const [accountId, setAccountId] = useState<string | null>(NO_FILTERS.accountId);
  const settled = useDebounce(text, SEARCH_DELAY_MS);

  return {
    text,
    // A cleared field shows the whole history at once; typing waits for a pause
    query: { text: text.trim() === '' ? '' : settled, categoryId, accountId },
    setText,
    chooseCategory: setCategoryId,
    toggleAccount: (id) => setAccountId((current) => (current === id ? null : id)),
    reset: () => {
      setText(NO_FILTERS.text);
      setCategoryId(NO_FILTERS.categoryId);
      setAccountId(NO_FILTERS.accountId);
    },
  };
}
