/**
 * React Query keys for subscription
 */
export const subscriptionKeys = {
  all: ['subscription'] as const,
  status: (userId: string) => [...subscriptionKeys.all, 'status', userId] as const,
};
