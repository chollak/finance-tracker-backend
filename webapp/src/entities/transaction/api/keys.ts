// Transaction query keys factory
export const transactionKeys = {
  all: ['transactions'] as const,
  lists: () => [...transactionKeys.all, 'list'] as const,
  list: (userId: string) => [...transactionKeys.lists(), userId] as const,
  // Under list(userId) on purpose: whatever refreshes the user's list refreshes the recent records too.
  // Without a limit — every recent list of the user, for invalidation
  recent: (userId: string, limit?: number) =>
    limit === undefined
      ? ([...transactionKeys.list(userId), 'recent'] as const)
      : ([...transactionKeys.list(userId), 'recent', limit] as const),
  // Without a range — every period of the user, for invalidation
  totals: (userId: string, range?: { from: string; to: string }) =>
    range
      ? ([...transactionKeys.all, 'totals', userId, range.from, range.to] as const)
      : ([...transactionKeys.all, 'totals', userId] as const),
  details: () => [...transactionKeys.all, 'detail'] as const,
  detail: (id: string) => [...transactionKeys.details(), id] as const,
  analytics: (userId: string, filters?: Record<string, unknown>) =>
    [...transactionKeys.all, 'analytics', userId, filters] as const,
  categorySummary: (userId: string, filters?: Record<string, unknown>) =>
    [...transactionKeys.all, 'category-summary', userId, filters] as const,
  trends: (userId: string, months?: number) =>
    [...transactionKeys.all, 'trends', userId, months] as const,
  // Archive keys
  archived: (userId: string) => [...transactionKeys.all, 'archived', userId] as const,
};
