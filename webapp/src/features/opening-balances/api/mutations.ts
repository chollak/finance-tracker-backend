import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import { settingsKeys, type UserSettings } from '@/entities/settings';
import { useUserStore } from '@/entities/user';
import type { OpeningBalancesPayload } from '../model/openingBalances';

interface OpeningBalancesResult {
  onboardedAt: string;
}

/**
 * POST /api/accounts/opening-balances (FT-109): the amounts become opening balances dated today and the
 * first launch is marked done. The settings in the cache get `onboardedAt` at once, so the app opens
 * without another request. «Already done» (409, e.g. on another device) re-reads the settings instead.
 */
export function useSaveOpeningBalances() {
  const queryClient = useQueryClient();
  const userId = useUserStore((state) => state.userId);

  return useMutation<OpeningBalancesResult, ApiError, OpeningBalancesPayload>({
    mutationFn: async (payload) => {
      const response = await apiClient.post<OpeningBalancesResult>(API_ENDPOINTS.ACCOUNTS.OPENING_BALANCES, payload);
      return response.data;
    },
    onSuccess: ({ onboardedAt }) => {
      queryClient.setQueryData<UserSettings>(settingsKeys.detail(userId ?? ''), (settings) =>
        settings ? { ...settings, onboardedAt } : settings
      );
      void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
    onError: (error) => {
      if (error.statusCode === 409) void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}
