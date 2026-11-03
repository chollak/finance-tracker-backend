/**
 * User ID Resolution Helper
 *
 * Standardizes userId handling across the application.
 * Converts telegramId to UUID for consistency.
 */

import { UserModule } from '../../../modules/user/userModule';
import { createLogger, LogCategory } from '../logging';
import { BusinessLogicError, ValidationError } from '../../domain/errors/AppError';

const logger = createLogger(LogCategory.USER);

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
 * Resolve any userId format to UUID. There are no guests (decision Д4, #206): every id that is not a UUID is resolved
 * as a Telegram id, creating the user on first contact — so an HTTP route checks the id is the signed-in user's own
 * (`verifyOwnership`) before resolving it.
 *
 * @param userId - Can be telegramId (string of numbers) or UUID
 * @param userModule - UserModule instance for resolving telegramId to UUID
 * @returns UUID string (the id as given if resolution fails: fail-open)
 *
 * @example
 * // telegramId → UUID
 * resolveUserIdToUUID("123456789", userModule) → "a1b2c3d4-e5f6-..."
 *
 * // Already UUID → returns as-is
 * resolveUserIdToUUID("a1b2c3d4-e5f6-...", userModule) → "a1b2c3d4-e5f6-..."
 */
export async function resolveUserIdToUUID(
  userId: string,
  userModule: UserModule
): Promise<string> {
  // Trim whitespace
  const trimmedId = userId.trim();

  if (!trimmedId) {
    throw new ValidationError('userId is required', 'userId');
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
    logger.error(`Failed to resolve userId "${trimmedId}" to UUID`, error as Error);
    // Return original if resolution fails (fail-open for backwards compatibility)
    return trimmedId;
  }
}

/**
 * Resolve any userId format to UUID and fail closed if async resolution fails.
 *
 * Use this for future security-sensitive HTTP/API boundaries where silently
 * falling back to a raw telegramId would be unsafe. The existing
 * `resolveUserIdToUUID()` helper remains fail-open for backwards-compatible
 * Telegram flows until individual routes are explicitly migrated.
 */
export async function resolveUserIdToUUIDStrict(
  userId: string,
  userModule: UserModule
): Promise<string> {
  const trimmedId = userId.trim();

  if (!trimmedId) {
    throw new ValidationError('userId is required', 'userId');
  }

  if (isUUID(trimmedId)) {
    return trimmedId;
  }

  try {
    const user = await userModule.getGetOrCreateUserUseCase().execute({
      telegramId: trimmedId,
    });
    return user.id;
  } catch (error) {
    logger.error(`Strict userId resolution failed for "${trimmedId}"`, error as Error);
    throw new BusinessLogicError('Failed to resolve userId to UUID', { userId: trimmedId });
  }
}

/**
 * Resolve userId synchronously if possible (a UUID)
 * Returns null if async resolution is needed
 */
export function tryResolveUserIdSync(userId: string): string | null {
  const trimmedId = userId.trim();

  if (isUUID(trimmedId)) {
    return trimmedId;
  }

  return null; // Needs async resolution
}
