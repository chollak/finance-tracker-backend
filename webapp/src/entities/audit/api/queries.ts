import { useQuery } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import { useUserStore } from '@/entities/user/model/store';
import type { Audit, Goals } from '../model/types';
import { auditKeys } from './keys';

/**
 * The audit of the month before today (`GET /api/audits/current`, FT-131): opened on its first read; until the first
 * mark its candidates are found again at every read (FT-142). Home's invitation, «Ещё», analytics and the audit screen
 * read the same answer.
 */
export function useCurrentAudit() {
  const userId = useUserStore((state) => state.userId);
  const userType = useUserStore((state) => state.userType);

  return useQuery<Audit, ApiError>({
    queryKey: auditKeys.current(userId ?? ''),
    queryFn: async (): Promise<Audit> => {
      const response = await apiClient.get<Audit>(API_ENDPOINTS.AUDITS.CURRENT);
      return response.data;
    },
    enabled: !!userId && userType === 'telegram',
  });
}

/** The goals counting today (`GET /api/goals`): «Цели после ревизии» on Home. */
export function useGoals() {
  const userId = useUserStore((state) => state.userId);
  const userType = useUserStore((state) => state.userType);

  return useQuery<Goals, ApiError>({
    queryKey: auditKeys.goals(userId ?? ''),
    queryFn: async (): Promise<Goals> => {
      const response = await apiClient.get<Goals>(API_ENDPOINTS.GOALS.LIST);
      return response.data;
    },
    enabled: !!userId && userType === 'telegram',
  });
}
