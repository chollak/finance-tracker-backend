// Budget query keys factory
export const budgetKeys = {
  all: ['budgets'] as const,
  lists: () => [...budgetKeys.all, 'list'] as const,
  list: (userId: string, active?: boolean) => [...budgetKeys.lists(), userId, active] as const,
  details: () => [...budgetKeys.all, 'detail'] as const,
  detail: (id: string) => [...budgetKeys.details(), id] as const,
  summaries: (userId: string) => [...budgetKeys.all, 'summaries', userId] as const,
  alerts: (userId: string, threshold?: number) =>
    [...budgetKeys.all, 'alerts', userId, threshold] as const,
};
