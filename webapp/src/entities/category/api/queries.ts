import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import { useUserStore } from '@/entities/user/model/store';
import type { Category } from '../model/types';

export const categoryKeys = {
  all: ['categories'] as const,
  list: (userId: string) => [...categoryKeys.all, 'list', userId] as const,
};

/**
 * The user's categories (FT-100): from `GET /api/categories`, cached for the session. Hidden ones are
 * included — pickers filter them out, history still shows their records.
 */
export function useCategories() {
  const userId = useUserStore((state) => state.userId);

  return useQuery({
    queryKey: categoryKeys.list(userId ?? ''),
    queryFn: async (): Promise<Category[]> => {
      const response = await apiClient.get<Category[]>(API_ENDPOINTS.CATEGORIES.LIST);
      return response.data ?? [];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}
