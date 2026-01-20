import { useQuery } from '@tanstack/react-query';
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
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });
}
