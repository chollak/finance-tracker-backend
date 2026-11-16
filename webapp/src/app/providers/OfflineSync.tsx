import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUserStore } from '@/entities/user';
import { persistReads } from '@/shared/lib/offline';
import { startOfflineSync } from './startOfflineSync';
import { savedReadUser } from './savedReadKeys';

/**
 * The offline mode of the app (FT-129): keeps the answers of Home's and the accounts' reads on the device, and for the
 * signed-in user sends what was written without a connection once it is back (`startOfflineSync`).
 * Not while the server refuses the Mini App's initData (#316, #385): every send would get the same 401 until the Mini
 * App is opened again. The outbox only waits — its records, their order and the rules of sending stay — and the new
 * opening, with new initData, sends them as before.
 */
export function OfflineSync() {
  const queryClient = useQueryClient();
  const userId = useUserStore((state) => state.userId);
  const miniAppRefused = useUserStore((state) => state.miniAppRefused);

  useEffect(() => persistReads(queryClient, { userOf: savedReadUser }), [queryClient]);

  useEffect(() => {
    if (!userId || miniAppRefused) return;
    return startOfflineSync({ queryClient, userId });
  }, [queryClient, userId, miniAppRefused]);

  return null;
}
