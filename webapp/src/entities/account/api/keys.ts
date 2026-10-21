export const accountKeys = {
  all: ['accounts'] as const,
  list: (userId: string) => [...accountKeys.all, 'list', userId] as const,
  // Under list(userId) on purpose: whatever refreshes the balances (every change of records, FT-111) refreshes the
  // account screen too (FT-118)
  operations: (userId: string, accountId: string) => [...accountKeys.list(userId), 'operations', accountId] as const,
};
