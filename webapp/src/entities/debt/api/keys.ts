// Debt query keys factory
export const debtKeys = {
  all: ['debts'] as const,
  lists: () => [...debtKeys.all, 'list'] as const,
  list: (userId: string, filters?: { status?: string; type?: string }) =>
    [...debtKeys.lists(), userId, filters] as const,
  details: () => [...debtKeys.all, 'detail'] as const,
  detail: (id: string) => [...debtKeys.details(), id] as const,
  withPayments: (id: string) => [...debtKeys.details(), id, 'payments'] as const,
  summary: (userId: string) => [...debtKeys.all, 'summary', userId] as const,
};
