/**
 * The query parameter that names a record whose sheet a screen opens: Home for the bot's «Изменить» (FT-115),
 * History for a record of the account screen (FT-118).
 */
export const RECORD_PARAM = 'record';

/** The query parameter History starts narrowed by: an account (FT-118, records of the account screen). */
export const ACCOUNT_PARAM = 'account';

// Route constants for type-safe navigation
export const ROUTES = {
  HOME: '/',

  // Transactions
  TRANSACTIONS: '/transactions',
  // History narrowed to an account with a record's sheet open: a record of the account screen opens there (FT-118,
  // design-system «Экран счёта»)
  ACCOUNT_RECORD: (accountId: string, recordId: string) =>
    `/transactions?${new URLSearchParams({ [ACCOUNT_PARAM]: accountId, [RECORD_PARAM]: recordId })}`,
  // A record: Home with its sheet open (FT-115; the edit page /transactions/:id/edit is gone)
  RECORD: (id: string) => `/?${RECORD_PARAM}=${encodeURIComponent(id)}`,

  // Manual entry (FT-113): a way to write, opened from Home, «Ещё» and an empty History
  MANUAL_ENTRY: '/add',

  // The review of the records a phrase sent from the composer made (FT-114)
  CAPTURE_REVIEW: '/review',

  // Budgets
  BUDGETS: '/budgets',
  ADD_BUDGET: '/budgets/add',
  EDIT_BUDGET: (id: string) => `/budgets/${id}/edit`,

  // Debts
  DEBTS: '/debts',
  ADD_DEBT: '/debts/add',
  DEBT_DETAILS: (id: string) => `/debts/${id}`,

  // Analytics
  ANALYTICS: '/analytics',

  // More
  MORE: '/more',

  // Accounts and the USD rate (FT-118): opened from the balance card on Home; an account opens its own screen
  ACCOUNTS: '/accounts',
  ACCOUNT: (id: string) => `/accounts/${encodeURIComponent(id)}`,
} as const;

// API endpoints
export const API_ENDPOINTS = {
  // The user's categories (FT-099); the user comes from authentication
  CATEGORIES: {
    LIST: '/categories',
  },

  // The user's settings (FT-098): theme, notifications, whether the first launch is done
  SETTINGS: '/settings',

  // Accounts (FT-101); the first launch sets their opening balances (FT-109)
  ACCOUNTS: {
    LIST: '/accounts',
    CREATE: '/accounts',
    UPDATE: (id: string) => `/accounts/${encodeURIComponent(id)}`,
    // «Отменить» after «Счёт добавлен»: only an account no operation has touched (FT-118)
    DELETE: (id: string) => `/accounts/${encodeURIComponent(id)}`,
    // The account screen: the account with its balance and its records and moves by day (FT-104, FT-118), read in
    // windows back in time
    OPERATIONS: (id: string, range: { from?: string; to?: string } = {}) => {
      const query = new URLSearchParams();
      if (range.from) query.set('from', range.from);
      if (range.to) query.set('to', range.to);
      const search = query.toString();
      return `/accounts/${encodeURIComponent(id)}/operations${search ? `?${search}` : ''}`;
    },
    OPENING_BALANCES: '/accounts/opening-balances',
  },

  // Transfers, exchanges and balance adjustments (FT-104); deleted softly and restored
  MOVES: {
    CREATE: '/moves',
    DELETE: (id: string) => `/moves/${encodeURIComponent(id)}`,
    RESTORE: (id: string) => `/moves/${encodeURIComponent(id)}/restore`,
  },

  // USD rate in effect for the user: own or the Central Bank's (FT-102)
  RATES: {
    USD: '/rates/usd',
  },

  // Transactions
  TRANSACTIONS: {
    LIST: (userId: string) => `/transactions/user/${userId}`,
    // History of the signed-in user, newest first (FT-107): search, filters and the next page's cursor (FT-116);
    // the user comes from authentication
    HISTORY: (
      params: {
        q?: string;
        categoryIds?: string[];
        accountIds?: string[];
        type?: 'income' | 'expense';
        cursor?: string;
        limit?: number;
      } = {}
    ) => {
      const query = new URLSearchParams();
      if (params.q) query.set('q', params.q);
      if (params.categoryIds?.length) query.set('categoryIds', params.categoryIds.join(','));
      if (params.accountIds?.length) query.set('accountIds', params.accountIds.join(','));
      if (params.type) query.set('type', params.type);
      if (params.cursor) query.set('cursor', params.cursor);
      if (params.limit) query.set('limit', String(params.limit));
      const search = query.toString();
      return `/transactions${search ? `?${search}` : ''}`;
    },
    // Income and expenses of a period through the one totals service (FT-111)
    TOTALS: (range: { from: string; to: string }) => `/transactions/totals?from=${range.from}&to=${range.to}`,
    // Frequent expenses of the last 30 days for the quick chips (FT-114); the user from authentication
    FREQUENT: '/transactions/frequent',
    CREATE: '/transactions',
    // One record of the user, as the record sheet reads it (FT-115)
    DETAIL: (id: string) => `/transactions/${id}`,
    UPDATE: (id: string) => `/transactions/${id}`,
    DELETE: (id: string) => `/transactions/${id}`,
    // «Отменить» after a delete brings the record back (FT-105)
    RESTORE: (id: string) => `/transactions/${id}/restore`,
    ANALYTICS: {
      SUMMARY: (userId: string, params?: { startDate?: string; endDate?: string }) => {
        const query = new URLSearchParams();
        if (params?.startDate) query.append('startDate', params.startDate);
        if (params?.endDate) query.append('endDate', params.endDate);
        return `/transactions/analytics/summary/${userId}${query.toString() ? `?${query}` : ''}`;
      },
      CATEGORIES: (userId: string, params?: { startDate?: string; endDate?: string }) => {
        const query = new URLSearchParams();
        if (params?.startDate) query.append('startDate', params.startDate);
        if (params?.endDate) query.append('endDate', params.endDate);
        return `/transactions/analytics/categories/${userId}${query.toString() ? `?${query}` : ''}`;
      },
      TRENDS: (userId: string, months: number = 12) =>
        `/transactions/analytics/trends/${userId}?months=${months}`,
    },
  },

  // Budgets
  BUDGETS: {
    LIST: (userId: string, active?: boolean) =>
      `/budgets/users/${userId}/budgets${active !== undefined ? `?active=${active}` : ''}`,
    CREATE: (userId: string) => `/budgets/users/${userId}/budgets`,
    UPDATE: (budgetId: string) => `/budgets/${budgetId}`,
    DELETE: (budgetId: string) => `/budgets/${budgetId}`,
    SUMMARIES: (userId: string) => `/budgets/users/${userId}/budgets/summaries`,
    ALERTS: (userId: string, threshold: number = 0.8) =>
      `/budgets/users/${userId}/budgets/alerts?threshold=${threshold}`,
  },

  // Dashboard
  DASHBOARD: {
    FULL: (userId: string, params?: { startDate?: string; endDate?: string }) => {
      const query = new URLSearchParams();
      if (params?.startDate) query.append('startDate', params.startDate);
      if (params?.endDate) query.append('endDate', params.endDate);
      return `/dashboard/${userId}${query.toString() ? `?${query}` : ''}`;
    },
    QUICK_STATS: (userId: string) => `/dashboard/${userId}/quick-stats`,
    HEALTH_SCORE: (userId: string) => `/dashboard/insights/${userId}/health-score`,
  },

  // Voice
  VOICE: {
    TEXT_INPUT: '/voice/text-input',
    VOICE_INPUT: '/voice/voice-input',
  },

  // Quick Capture — one line of natural text → saved transactions/debts (docs/QUICK_CAPTURE_API.md)
  QUICK_CAPTURE: '/quick-capture',

  // Debts
  DEBTS: {
    LIST: (userId: string, status?: string, type?: string) => {
      const query = new URLSearchParams();
      if (status) query.append('status', status);
      if (type) query.append('type', type);
      return `/debts/user/${userId}${query.toString() ? `?${query}` : ''}`;
    },
    CREATE: (userId: string) => `/debts/user/${userId}`,
    DETAIL: (debtId: string) => `/debts/${debtId}`,
    WITH_PAYMENTS: (debtId: string) => `/debts/${debtId}?withPayments=true`,
    UPDATE: (debtId: string) => `/debts/${debtId}`,
    DELETE: (debtId: string) => `/debts/${debtId}`,
    CANCEL: (debtId: string) => `/debts/${debtId}/cancel`,
    PAY: (debtId: string) => `/debts/${debtId}/pay`,
    PAY_FULL: (debtId: string) => `/debts/${debtId}/pay-full`,
    DELETE_PAYMENT: (paymentId: string) => `/debts/payments/${paymentId}`,
    SUMMARY: (userId: string) => `/debts/user/${userId}/summary`,
  },

  // Subscription
  SUBSCRIPTION: {
    STATUS: (userId: string) => `/subscription/${userId}`,
  },
} as const;
