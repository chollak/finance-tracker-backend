import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import { useUserStore } from '@/entities/user/model/store';
import type { SettingsPatch, UserSettings } from '../model/types';
import { settingsKeys } from './queries';

interface Snapshot {
  previous: UserSettings | undefined;
}

const UPDATE_SETTINGS = ['settings', 'update'] as const;

/**
 * `PATCH /api/settings` (FT-098) for the signed-in user. The change shows at once (the settings in the cache
 * take it before the answer); a failure puts back what was there and calls `onError`, so the screen can say
 * so. Changes go out one after another, so the last one pressed is the one the server keeps, and the
 * settings are read again only after the last of them — an earlier answer cannot undo a later press.
 */
export function useUpdateSettings({ onError }: { onError?: (error: ApiError) => void } = {}) {
  const queryClient = useQueryClient();
  const userId = useUserStore((state) => state.userId);
  const key = settingsKeys.detail(userId ?? '');

  return useMutation<UserSettings, ApiError, SettingsPatch, Snapshot>({
    mutationKey: UPDATE_SETTINGS,
    scope: { id: 'settings' },
    mutationFn: async (patch) => {
      const response = await apiClient.patch<UserSettings>(API_ENDPOINTS.SETTINGS, patch);
      return response.data;
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<UserSettings>(key);
      queryClient.setQueryData<UserSettings>(key, (settings) => (settings ? { ...settings, ...patch } : settings));
      return { previous };
    },
    onError: (error, _patch, snapshot) => {
      if (snapshot?.previous) queryClient.setQueryData(key, snapshot.previous);
      onError?.(error);
    },
    onSettled: () => {
      // This change still counts as running here: 1 means no other change is on its way
      if (queryClient.isMutating({ mutationKey: UPDATE_SETTINGS }) === 1) {
        void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
      }
    },
  });
}
