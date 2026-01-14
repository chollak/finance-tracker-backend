import type { TransactionViewModel } from '@/entities/transaction';

interface FilterOptions {
  searchQuery: string;
  typeFilter: 'all' | 'income' | 'expense';
  categoryFilter: string | null;
}

/**
 * Filters transactions based on search query, type, and category
 */
export function filterTransactions(
  transactions: TransactionViewModel[],
  options: FilterOptions
): TransactionViewModel[] {
  const { searchQuery, typeFilter, categoryFilter } = options;

  return transactions.filter((transaction) => {
    // Type filter
    if (typeFilter !== 'all' && transaction.type !== typeFilter) {
      return false;
    }

    // Category filter
    if (categoryFilter && transaction.category !== categoryFilter) {
      return false;
    }

    // Search query (searches in description, category, and merchant)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesDescription = transaction.description
        ?.toLowerCase()
        .includes(query);
      const matchesCategory = transaction.category
        ?.toLowerCase()
        .includes(query);
      const matchesMerchant = transaction.merchant
        ?.toLowerCase()
        .includes(query);

      if (!matchesDescription && !matchesCategory && !matchesMerchant) {
        return false;
      }
    }

    return true;
  });
}
