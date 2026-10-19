import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import { useUserStore } from '@/entities/user/model/store';
import type { UserSettings } from '../model/types';

export const settingsKeys = {
  all: ['settings'] as const,
  detail: (userId: string) => [...settingsKeys.all, userId] as const,
};

/**
 * The signed-in user's settings (`GET /api/settings`; the user comes from authentication). Guests have
 * no server settings, so the query does not run for them.
 */
export function useSettings() {
  const userId = useUserStore((state) => state.userId);
  const userType = useUserStore((state) => state.userType);

  return useQuery({
    queryKey: settingsKeys.detail(userId ?? ''),
    queryFn: async (): Promise<UserSettings> => {
      const response = await apiClient.get<UserSettings>(API_ENDPOINTS.SETTINGS);
      return response.data;
    },
    enabled: !!userId && userType === 'telegram',
    staleTime: 5 * 60 * 1000,
  });
}
