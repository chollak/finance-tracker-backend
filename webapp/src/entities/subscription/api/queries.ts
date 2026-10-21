import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { SubscriptionStatus } from '../model/types';
import { subscriptionKeys } from './keys';

/**
 * Hook to fetch subscription status and usage limits
 */
export function useSubscription(userId: string | null) {
  return useQuery({
    queryKey: subscriptionKeys.status(userId || ''),
    queryFn: async () => {
      const response = await apiClient.get<SubscriptionStatus>(
        API_ENDPOINTS.SUBSCRIPTION.STATUS(userId!)
      );

      return response.data;
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes cache (reduced for fresher data)
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });
}

/**
 * Hook to invalidate subscription data
 * Use this after creating/deleting transactions, debts, etc.
 */
export function useInvalidateSubscription() {
  const queryClient = useQueryClient();

  return useCallback(
    (userId: string) => {
      queryClient.invalidateQueries({
        queryKey: subscriptionKeys.status(userId),
      });
    },
    [queryClient]
  );
}
