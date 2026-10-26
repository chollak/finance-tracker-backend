// User entity barrel export

// Store
export { useUserStore, useHasHydrated } from './model/store';
export type { UserType, SessionUser } from './model/store';

// The browser's session (FT-128)
export { readSession, closeSession } from './api/session';

// Lib
export { getTelegramUser } from './lib/getTelegramUser';
