import { useCallback, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useUserStore } from '@/entities/user';
import { accountWriteError } from '../model/accountForms';

/**
 * A sheet's write: runs it once at a time and keeps what went wrong, so the sheet stays open with what was typed
 * and says why (a toast would be hidden behind the sheet, Toast.md). `run` resolves to what the write answered,
 * or null when it failed.
 */
export function useAccountWrite() {
  const queryClient = useQueryClient();
  const userId = useUserStore((state) => state.userId) ?? '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(write: (queryClient: QueryClient, userId: string) => Promise<T>): Promise<{ value: T } | null> => {
      setBusy(true);
      setError(null);
      try {
        return { value: await write(queryClient, userId) };
      } catch (failure) {
        setError(accountWriteError(failure as Parameters<typeof accountWriteError>[0]));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [queryClient, userId]
  );

  const clearError = useCallback(() => setError(null), []);

  return { run, busy, error, clearError, queryClient, userId };
}
