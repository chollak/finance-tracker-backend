import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUserStore } from '@/entities/user';
import { persistReads } from '@/shared/lib/offline';
import { startOfflineSync } from './offlineSync';
import { savedReadUser } from './savedReadKeys';

/**
 * The offline mode of the app (FT-129): keeps the answers of Home's and the accounts' reads on the device, and for the
 * signed-in user sends what was written without a connection once it is back (`startOfflineSync`).
 */
export function OfflineSync() {
  const queryClient = useQueryClient();
  const userId = useUserStore((state) => state.userId);

  useEffect(() => persistReads(queryClient, { userOf: savedReadUser }), [queryClient]);

  useEffect(() => {
    if (!userId) return;
    return startOfflineSync({ queryClient, userId });
  }, [queryClient, userId]);

  return null;
}
