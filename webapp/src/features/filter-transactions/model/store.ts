import { create } from 'zustand';

interface TransactionFiltersState {
  searchQuery: string;
  typeFilter: 'all' | 'income' | 'expense';
  categoryFilter: string | null;
  dateRange: {
    start: Date | null;
    end: Date | null;
  };

  // Actions
  setSearchQuery: (query: string) => void;
  setTypeFilter: (type: 'all' | 'income' | 'expense') => void;
  setCategoryFilter: (category: string | null) => void;
  setDateRange: (start: Date | null, end: Date | null) => void;
  resetFilters: () => void;
}

const initialState = {
  searchQuery: '',
  typeFilter: 'all' as const,
  categoryFilter: null,
  dateRange: {
    start: null,
    end: null,
  },
};

/**
 * Transaction filters store
 * Used for filtering transaction lists
 */
export const useTransactionFiltersStore = create<TransactionFiltersState>((set) => ({
  ...initialState,

  setSearchQuery: (query) => set({ searchQuery: query }),

  setTypeFilter: (type) => set({ typeFilter: type }),

  setCategoryFilter: (category) => set({ categoryFilter: category }),

  setDateRange: (start, end) =>
    set({ dateRange: { start, end } }),

  resetFilters: () => set(initialState),
}));
