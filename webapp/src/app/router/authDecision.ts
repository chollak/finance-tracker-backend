export type AuthDecision = 'app' | 'login' | 'wait';

/**
 * Who the app opens for (FT-128, decision Д4: no guest mode). A known user — the app; in a browser whose session was
 * checked and is not there (or «Выйти») — the login screen; while that is still being learned — the app's loading,
 * so the login does not flash before a session that is there.
 */
export function authDecision({ userId, signedOut }: { userId: string | null; signedOut: boolean }): AuthDecision {
  if (userId) return 'app';
  return signedOut ? 'login' : 'wait';
}
