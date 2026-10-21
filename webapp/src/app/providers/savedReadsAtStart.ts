import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUserStore } from '@/entities/user';
import { restoreSavedReads } from '@/shared/lib/offline';

/** How long the start waits for the reads kept on the device before it opens anyway. */
const RESTORE_WAIT_MS = 1_500;

const startsOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * Whether the app may show its screens (FT-129): an app that opens without a connection first fills its reads from what
 * was kept on the device — a moment, and at most 1.5 seconds — so Home opens on its data rather than on empty shapes.
 * Online, and for nobody signed in, it is ready at once.
 */
export function useSavedReadsAtStart(hasHydrated: boolean): boolean {
  const queryClient = useQueryClient();
  const userId = useUserStore((state) => state.userId);
  const [restored, setRestored] = useState(() => !startsOffline());

  useEffect(() => {
    if (restored || !hasHydrated || !userId) return;
    let cancelled = false;
    const finish = () => {
      if (!cancelled) setRestored(true);
    };
    const timer = setTimeout(finish, RESTORE_WAIT_MS);
    void restoreSavedReads(queryClient, userId).finally(finish);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [restored, hasHydrated, userId, queryClient]);

  // Once open, the app stays open: a user who becomes known later (Telegram's, after the start) only gets their reads
  // filled, without the screens going back to the loading
  const ready = restored || (hasHydrated && !userId);
  const [opened, setOpened] = useState(false);
  if (ready && !opened) setOpened(true);
  return ready || opened;
}
