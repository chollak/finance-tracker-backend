// Transaction query keys factory
export const transactionKeys = {
  all: ['transactions'] as const,
  lists: () => [...transactionKeys.all, 'list'] as const,
  list: (userId: string) => [...transactionKeys.lists(), userId] as const,
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
