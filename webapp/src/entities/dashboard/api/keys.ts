/**
 * Query key factory for dashboard queries
 */
export const dashboardKeys = {
  all: ['dashboard'] as const,
  insights: (userId: string) => [...dashboardKeys.all, 'insights', userId] as const,
  quickStats: (userId: string) => [...dashboardKeys.all, 'quickStats', userId] as const,
};
