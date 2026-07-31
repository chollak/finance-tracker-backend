import type { TransactionViewModel } from '@/entities/transaction';
import { matchesNeedsReviewQuery } from '@/entities/transaction';

interface FilterOptions {
  searchQuery: string;
  typeFilter: 'all' | 'income' | 'expense' | 'not_expense';
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
    if (typeFilter === 'not_expense') {
      if (!transaction._isNonExpenseMovement) {
        return false;
      }
    } else if (typeFilter !== 'all' && transaction.type !== typeFilter) {
      return false;
    }

    // Category filter
    if (categoryFilter && transaction.category !== categoryFilter) {
      return false;
    }

    // Search query (searches in description, category, merchant, and semantic type label)
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
      const matchesSemanticType = transaction._semanticTypeLabel
        ?.toLowerCase()
        .includes(query);
      const matchesNeedsReview = matchesNeedsReviewQuery(transaction._needsReview, query);

      if (
        !matchesDescription &&
        !matchesCategory &&
        !matchesMerchant &&
        !matchesSemanticType &&
        !matchesNeedsReview
      ) {
        return false;
      }
    }

    return true;
  });
}
