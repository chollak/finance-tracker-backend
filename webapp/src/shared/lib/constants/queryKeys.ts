// Query key prefixes for TanStack Query
// This provides a centralized place to manage all query keys

export const QUERY_KEYS = {
  // Transactions
  TRANSACTIONS: 'transactions',
  TRANSACTION_DETAIL: 'transaction-detail',
  TRANSACTION_ANALYTICS: 'transaction-analytics',

  // Budgets
  BUDGETS: 'budgets',
  BUDGET_DETAIL: 'budget-detail',
  BUDGET_SUMMARIES: 'budget-summaries',
  BUDGET_ALERTS: 'budget-alerts',

  // Dashboard
  DASHBOARD: 'dashboard',
  DASHBOARD_QUICK_STATS: 'dashboard-quick-stats',
  DASHBOARD_HEALTH_SCORE: 'dashboard-health-score',

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

  // Budgets
  budgets: {
    all: [QUERY_KEYS.BUDGETS] as const,
    list: (userId: string, active?: boolean) =>
      [...queryKeys.budgets.all, 'list', userId, active] as const,
    detail: (id: string) => [QUERY_KEYS.BUDGET_DETAIL, id] as const,
    summaries: (userId: string) => [QUERY_KEYS.BUDGET_SUMMARIES, userId] as const,
    alerts: (userId: string, threshold?: number) =>
      [QUERY_KEYS.BUDGET_ALERTS, userId, threshold] as const,
  },

  // Dashboard
  dashboard: {
    all: [QUERY_KEYS.DASHBOARD] as const,
    full: (userId: string, filters?: Record<string, unknown>) =>
      [...queryKeys.dashboard.all, 'full', userId, filters] as const,
    quickStats: (userId: string) => [QUERY_KEYS.DASHBOARD_QUICK_STATS, userId] as const,
    healthScore: (userId: string) => [QUERY_KEYS.DASHBOARD_HEALTH_SCORE, userId] as const,
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
