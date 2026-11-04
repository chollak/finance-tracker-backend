// Query key prefixes for TanStack Query
// This provides a centralized place to manage all query keys

export const QUERY_KEYS = {
  // Transactions
  TRANSACTIONS: 'transactions',
  TRANSACTION_DETAIL: 'transaction-detail',
  TRANSACTION_ANALYTICS: 'transaction-analytics',

  // Analytics
  ANALYTICS_SUMMARY: 'analytics-summary',
  ANALYTICS_CATEGORIES: 'analytics-categories',
  ANALYTICS_TRENDS: 'analytics-trends',
} as const;

// Query key factories (will be used in entities layer)
// These ensure consistent query key structure across the app
export const queryKeys = {
  // Transactions
  transactions: {
    all: [QUERY_KEYS.TRANSACTIONS] as const,
    list: (userId: string) => [...queryKeys.transactions.all, 'list', userId] as const,
    detail: (id: string) => [QUERY_KEYS.TRANSACTION_DETAIL, id] as const,
    analytics: (userId: string, filters?: Record<string, unknown>) =>
      [QUERY_KEYS.TRANSACTION_ANALYTICS, userId, filters] as const,
  },

  // Analytics
  analytics: {
    summary: (userId: string, filters?: Record<string, unknown>) =>
      [QUERY_KEYS.ANALYTICS_SUMMARY, userId, filters] as const,
    categories: (userId: string, filters?: Record<string, unknown>) =>
      [QUERY_KEYS.ANALYTICS_CATEGORIES, userId, filters] as const,
    trends: (userId: string, months?: number) =>
      [QUERY_KEYS.ANALYTICS_TRENDS, userId, months] as const,
  },
} as const;
