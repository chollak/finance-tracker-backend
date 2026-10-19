import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import { useUserStore } from '@/entities/user/model/store';
import type { AccountsOverview } from '../model/types';
import { accountKeys } from './keys';

/**
 * The signed-in user's accounts with balances and the total (`GET /api/accounts`; the user comes from
 * authentication). Guests keep records on the device and have no accounts, so the query does not run.
 */
export function useAccounts() {
  const userId = useUserStore((state) => state.userId);
  const userType = useUserStore((state) => state.userType);

  return useQuery({
    queryKey: accountKeys.list(userId ?? ''),
    queryFn: async (): Promise<AccountsOverview> => {
      const response = await apiClient.get<AccountsOverview>(API_ENDPOINTS.ACCOUNTS.LIST);
      return response.data;
    },
    enabled: !!userId && userType === 'telegram',
  });
}
