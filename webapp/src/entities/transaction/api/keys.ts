// Transaction query keys factory
export const transactionKeys = {
  all: ['transactions'] as const,
  lists: () => [...transactionKeys.all, 'list'] as const,
  // Every list of the user's records: nothing reads this key itself (#289), the lists below are under it, so a change
  // of categories or a capture refreshes them all at once
  list: (userId: string) => [...transactionKeys.lists(), userId] as const,
  // Without a limit — every recent list of the user, for invalidation
  recent: (userId: string, limit?: number) =>
    limit === undefined
      ? ([...transactionKeys.list(userId), 'recent'] as const)
      : ([...transactionKeys.list(userId), 'recent', limit] as const),
  // The quick chips' frequent expenses (FT-114): under list(userId), so every change of records refreshes them
  frequent: (userId: string) => [...transactionKeys.list(userId), 'frequent'] as const,
  // History with its search and filters (FT-116), under list(userId) too. Without a query — every History of the
  // user, for invalidation
  history: (userId: string, query?: { text: string; categoryId: string | null; accountId: string | null; type: string | null }) =>
    query
      ? ([...transactionKeys.list(userId), 'history', query.text, query.categoryId, query.accountId, query.type] as const)
      : ([...transactionKeys.list(userId), 'history'] as const),
  // Without a range — every period of the user, for invalidation
  totals: (userId: string, range?: { from: string; to: string }) =>
    range
      ? ([...transactionKeys.all, 'totals', userId, range.from, range.to] as const)
      : ([...transactionKeys.all, 'totals', userId] as const),
  // One record as the record sheet shows it (FT-115): the full record with its amount in minor units,
  // currency and account
  record: (id: string) => [...transactionKeys.all, 'record', id] as const,
};
