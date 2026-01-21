/**
 * User ID Resolution Helper
 *
 * Standardizes userId handling across the application.
 * Converts telegramId to UUID for consistency.
 */

import { UserModule } from '../../../modules/user/userModule';

/**
 * UUID v4 regex pattern
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Check if a string is a valid UUID v4
 */
export function isUUID(str: string): boolean {
  return UUID_PATTERN.test(str);
}

/**
 * Check if userId is a guest user
 */
export function isGuestUser(userId: string): boolean {
  return userId.startsWith('guest_');
}

/**
 * Resolve any userId format to UUID
 *
 * @param userId - Can be telegramId (string of numbers), UUID, or guest_* prefix
 * @param userModule - UserModule instance for resolving telegramId to UUID
 * @returns UUID string (or original for guest users)
 *
 * @example
 * // telegramId → UUID
 * resolveUserIdToUUID("123456789", userModule) → "a1b2c3d4-e5f6-..."
 *
 * // Already UUID → returns as-is
 * resolveUserIdToUUID("a1b2c3d4-e5f6-...", userModule) → "a1b2c3d4-e5f6-..."
 *
 * // Guest user → returns as-is
 * resolveUserIdToUUID("guest_abc123", userModule) → "guest_abc123"
 */
export async function resolveUserIdToUUID(
  userId: string,
  userModule: UserModule
): Promise<string> {
  // Trim whitespace
  const trimmedId = userId.trim();

  // Guest users don't need resolution
  if (isGuestUser(trimmedId)) {
    return trimmedId;
  }

  // Already a UUID - return as-is
  if (isUUID(trimmedId)) {
    return trimmedId;
  }

  // Resolve telegramId to UUID via UserModule
  try {
    const user = await userModule.getGetOrCreateUserUseCase().execute({
      telegramId: trimmedId,
    });
    return user.id;
  } catch (error) {
    console.error(`Failed to resolve userId "${trimmedId}" to UUID:`, error);
    // Return original if resolution fails (fail-open for backwards compatibility)
    return trimmedId;
  }
}

/**
 * Resolve userId synchronously if possible (UUID or guest)
 * Returns null if async resolution is needed
 */
export function tryResolveUserIdSync(userId: string): string | null {
  const trimmedId = userId.trim();

  if (isGuestUser(trimmedId) || isUUID(trimmedId)) {
    return trimmedId;
  }

  return null; // Needs async resolution
}
