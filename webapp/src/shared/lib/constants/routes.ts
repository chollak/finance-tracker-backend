// Route constants for type-safe navigation
export const ROUTES = {
  HOME: '/',

  // Transactions
  TRANSACTIONS: '/transactions',
  ADD_TRANSACTION: '/transactions/add',
  EDIT_TRANSACTION: (id: string) => `/transactions/${id}/edit`,

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
} as const;

// API endpoints
export const API_ENDPOINTS = {
  // Transactions
  TRANSACTIONS: {
    LIST: (userId: string) => `/transactions/user/${userId}`,
    CREATE: '/transactions',
    UPDATE: (id: string) => `/transactions/${id}`,
    DELETE: (id: string) => `/transactions/${id}`,
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
    ARCHIVE: {
      ONE: (id: string) => `/transactions/${id}/archive`,
      UNARCHIVE: (id: string) => `/transactions/${id}/unarchive`,
      BATCH: '/transactions/archive/batch',
      ALL: (userId: string) => `/transactions/archive/all/${userId}`,
      LIST: (userId: string) => `/transactions/archived/user/${userId}`,
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
