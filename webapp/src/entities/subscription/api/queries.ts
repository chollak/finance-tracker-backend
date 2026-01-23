import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { SubscriptionStatus } from '../model/types';
import { subscriptionKeys } from './keys';
import { isGuestId } from '@/shared/lib/utils/guestId';

/**
 * Guest user subscription - unlimited local usage
 */
const GUEST_SUBSCRIPTION: SubscriptionStatus = {
  isPremium: false,
  isTrialActive: false,
  trialDaysLeft: null,
  subscriptionDaysLeft: null,
  limits: {
    transactions: { used: 0, limit: null, remaining: null },
    voiceInputs: { used: 0, limit: null, remaining: null },
    activeDebts: { used: 0, limit: null, remaining: null },
  },
};

/**
 * Hook to fetch subscription status and usage limits
 * Guest users: returns unlimited local subscription (no server call)
 */
export function useSubscription(userId: string | null) {
  const isGuest = userId ? isGuestId(userId) : false;

  return useQuery({
    queryKey: subscriptionKeys.status(userId || ''),
    queryFn: async () => {
      // Guest users: unlimited local usage
      if (isGuest) return GUEST_SUBSCRIPTION;

      const response = await apiClient.get<SubscriptionStatus>(
        API_ENDPOINTS.SUBSCRIPTION.STATUS(userId!)
      );

      return response.data;
    },
    enabled: !!userId && !isGuest,
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
