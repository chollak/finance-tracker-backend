import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import { useUserStore } from '@/entities/user/model/store';
import type { AnalyticsType, CategoryAnalytics, MonthAnalytics } from '../model/types';
import { analyticsKeys } from './keys';

/**
 * Where the money of a month went (FT-120: `GET /api/analytics?month&type`). `month` undefined — the current month
 * as the server counts it. While another month or type is read, the answer before stays (`isPlaceholderData`): the
 * screen keeps its month stepper and shows the new month as loading. Guests have no server analytics.
 */
export function useMonthAnalytics(view: { month: string | undefined; type: AnalyticsType }) {
  const userId = useUserStore((state) => state.userId);
  const userType = useUserStore((state) => state.userType);

  return useQuery<MonthAnalytics, ApiError>({
    queryKey: analyticsKeys.month(userId ?? '', view.month, view.type),
    queryFn: async (): Promise<MonthAnalytics> => {
      const response = await apiClient.get<MonthAnalytics>(API_ENDPOINTS.ANALYTICS.MONTH(view));
      return response.data;
    },
    enabled: !!userId && userType === 'telegram',
    placeholderData: keepPreviousData,
  });
}

/**
 * One category of a month (FT-120: `GET /api/analytics/categories/:id?month`): its total and change, every day of
 * the period and its operations. A category that is not the user's answers with `statusCode: 404`, a month later than
 * the current one with `statusCode: 400`.
 */
export function useCategoryAnalytics(categoryId: string | undefined, month: string | undefined) {
  const userId = useUserStore((state) => state.userId);
  const userType = useUserStore((state) => state.userType);

  return useQuery<CategoryAnalytics, ApiError>({
    queryKey: analyticsKeys.category(userId ?? '', categoryId ?? '', month),
    queryFn: async (): Promise<CategoryAnalytics> => {
      const response = await apiClient.get<CategoryAnalytics>(API_ENDPOINTS.ANALYTICS.CATEGORY(categoryId!, month));
      return response.data;
    },
    enabled: !!userId && userType === 'telegram' && !!categoryId,
    retry: (failures, error) => error.statusCode !== 404 && error.statusCode !== 400 && failures < 2,
  });
}
