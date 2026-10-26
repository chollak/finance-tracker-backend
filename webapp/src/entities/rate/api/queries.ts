import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import { useUserStore } from '@/entities/user/model/store';
import type { UsdRates } from '../model/types';

export const rateKeys = {
  all: ['rates'] as const,
  usd: (userId: string) => [...rateKeys.all, 'usd', userId] as const,
};

/** The USD rate in effect for the signed-in user (FT-102): own if set, else the Central Bank's. */
export function useUsdRate() {
  const userId = useUserStore((state) => state.userId);
  const userType = useUserStore((state) => state.userType);

  return useQuery({
    queryKey: rateKeys.usd(userId ?? ''),
    queryFn: async (): Promise<UsdRates> => {
      const response = await apiClient.get<UsdRates>(API_ENDPOINTS.RATES.USD);
      return response.data;
    },
    enabled: !!userId && userType === 'telegram',
    staleTime: 10 * 60 * 1000,
  });
}
