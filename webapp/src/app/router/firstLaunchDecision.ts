import type { UserType } from '@/entities/user';

export type FirstLaunchDecision = 'wait' | 'first-launch' | 'app';

export interface FirstLaunchGateInput {
  userType: UserType;
  settings: { isPending: boolean; isError: boolean; data: { onboardedAt: string | null } | undefined };
  /** The gate has already let this user into the app in this session. */
  opened?: boolean;
}

/**
 * Whether the app opens on «Сколько у вас сейчас денег?» (FT-109): while `onboardedAt` is empty — for a
 * new user and for one whose history was migrated alike. If the settings cannot be read the app still opens: the
 * question waits for the next start instead of locking the user out.
 *
 * The gate waits only once. A screen that reads the settings itself asks for them again as it mounts, and a failed
 * read with no data is pending again until that answer comes (TanStack's retryOnMount). Waiting again would take the
 * screen away, mount it anew when the read fails and ask once more — without end (FT-125 review). So once the app is
 * open, it stays open while the settings are read again.
 */
export function firstLaunchDecision({ userType, settings, opened = false }: FirstLaunchGateInput): FirstLaunchDecision {
  if (userType === null) return 'wait';
  if (settings.isError) return 'app';
  if (settings.isPending || !settings.data) return opened ? 'app' : 'wait';
  return settings.data.onboardedAt ? 'app' : 'first-launch';
}
