import type { UserType } from '@/entities/user';

export type FirstLaunchDecision = 'wait' | 'first-launch' | 'app';

export interface FirstLaunchGateInput {
  userType: UserType;
  settings: { isPending: boolean; isError: boolean; data: { onboardedAt: string | null } | undefined };
}

/**
 * Whether the app opens on «Сколько у вас сейчас денег?» (FT-109): while `onboardedAt` is empty — for a
 * new user and for one whose history was migrated alike. Guests keep their records on the device and have
 * no server accounts, so they are not asked. If the settings cannot be read the app still opens: the
 * question waits for the next start instead of locking the user out.
 */
export function firstLaunchDecision({ userType, settings }: FirstLaunchGateInput): FirstLaunchDecision {
  if (userType === 'guest') return 'app';
  if (userType === null) return 'wait';
  if (settings.isError) return 'app';
  if (settings.isPending || !settings.data) return 'wait';
  return settings.data.onboardedAt ? 'app' : 'first-launch';
}
