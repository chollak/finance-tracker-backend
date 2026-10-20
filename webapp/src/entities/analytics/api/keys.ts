import type { AnalyticsType } from '../model/types';

/** Analytics of the user (FT-121). `all(userId)` is among what every change of records refetches. */
export const analyticsKeys = {
  all: (userId: string) => ['analytics', userId] as const,
  // `month` undefined — the current month as the server counts it (the day in Tashkent)
  month: (userId: string, month: string | undefined, type: AnalyticsType) =>
    [...analyticsKeys.all(userId), 'month', month ?? 'current', type] as const,
  category: (userId: string, categoryId: string, month: string | undefined) =>
    [...analyticsKeys.all(userId), 'category', categoryId, month ?? 'current'] as const,
};
