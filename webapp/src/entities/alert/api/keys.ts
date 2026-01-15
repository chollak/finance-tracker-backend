/**
 * Query key factory for alert queries
 */
export const alertKeys = {
  all: ['alerts'] as const,
  budgetAlerts: (userId: string, threshold?: number) =>
    [...alertKeys.all, 'budget', userId, threshold] as const,
};
