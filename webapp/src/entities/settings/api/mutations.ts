import { useIsMutating, useMutation, useQueryClient, type Mutation, type QueryClient } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import { useUserStore } from '@/entities/user/model/store';
import type { SettingsPatch, UserSettings } from '../model/types';
import { settingsKeys } from './queries';

/**
 * Changes pressed before the earlier ones were answered make one chain. `base` is the settings as they were read before
 * its first change; the object itself names the chain.
 */
interface Chain {
  base: UserSettings | undefined;
}

interface Snapshot {
  chain: Chain;
}

type SettingsMutation = Mutation<UserSettings, ApiError, SettingsPatch, Snapshot>;

const UPDATE_SETTINGS = ['settings', 'update'] as const;

function settingsMutations(queryClient: QueryClient): SettingsMutation[] {
  // The cache keeps mutations untyped; this key is only ever used by the mutation below
  return queryClient.getMutationCache().findAll({ mutationKey: UPDATE_SETTINGS }) as unknown as SettingsMutation[];
}

/** The settings as the server has them now: the last answer within the chain, else what was read before it. */
function serverSettings(queryClient: QueryClient, chain: Chain): UserSettings | undefined {
  const answered = settingsMutations(queryClient).filter((mutation) => mutation.state.context?.chain === chain && mutation.state.status === 'success');
  return answered.at(-1)?.state.data ?? chain.base;
}

/**
 * The fields of a failed change that no change still on its way will set: those go back to what the server has. The
 * changes run one after another, so whatever is still pending was pressed after the failed one.
 */
function lostFields(queryClient: QueryClient, failed: SettingsPatch, own: Snapshot | undefined): Array<keyof SettingsPatch> {
  const later = settingsMutations(queryClient).filter((mutation) => mutation.state.status === 'pending' && mutation.state.context !== own);
  const setLater = new Set(later.flatMap((mutation) => Object.keys(mutation.state.variables ?? {})));
  return (Object.keys(failed) as Array<keyof SettingsPatch>).filter((field) => !setLater.has(field));
}

/**
 * `PATCH /api/settings` (FT-098) for the signed-in user. The change shows at once (the settings in the cache take it
 * before the answer). Changes go out one after another, so the last one pressed is the one the server keeps, and the
 * settings are read again only after the last of them — an earlier answer cannot undo a later press.
 *
 * A failure puts back only the settings no later press is about to change, and puts them back to what the server has
 * (its last answer, or what was read), never to an earlier guess of the screen; then `onError` lets the screen say so.
 * A failure a later press of the same setting replaces says nothing: that press decides (FT-149 review).
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
      // A change still on its way: this one joins its chain; otherwise the cache is what the server has
      const running = settingsMutations(queryClient).find((mutation) => mutation.state.status === 'pending' && mutation.state.context);
      const chain = running?.state.context?.chain ?? { base: queryClient.getQueryData<UserSettings>(key) };
      queryClient.setQueryData<UserSettings>(key, (settings) => (settings ? { ...settings, ...patch } : settings));
      return { chain };
    },
    onError: (error, patch, snapshot) => {
      const lost = lostFields(queryClient, patch, snapshot);
      if (lost.length === 0) return;
      const server = snapshot ? serverSettings(queryClient, snapshot.chain) : undefined;
      if (server) {
        const restored = Object.fromEntries(lost.map((field) => [field, server[field]])) as SettingsPatch;
        queryClient.setQueryData<UserSettings>(key, (settings) => (settings ? { ...settings, ...restored } : settings));
      }
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

/**
 * A change of the settings is on its way to the server. Until it lands, the settings in the cache are the screen's
 * own guess, and whatever copies them elsewhere (the theme on the device, FT-125) waits for the last answer.
 */
export function useSavingSettings(): boolean {
  return useIsMutating({ mutationKey: UPDATE_SETTINGS }) > 0;
}
