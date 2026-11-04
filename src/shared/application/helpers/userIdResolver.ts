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

/** A Telegram user id as text: a positive whole number in digits, of any length (#224). */
const TELEGRAM_ID_PATTERN = /^0*[1-9]\d*$/;

/**
 * Check if a string is a valid UUID v4
 */
export function isUUID(str: string): boolean {
  return UUID_PATTERN.test(str);
}

/**
 * Whether resolution may take the id (#224): a UUID, or a Telegram id — a positive whole number in digits. Anything
 * else (`guest_zzz`, `abc`, `-5`, `1.5`, `0`) names no user, and resolving it would create a `users` row for it.
 * Spaces around the id are fine, as in the resolver.
 */
export function isResolvableUserId(userId: string): boolean {
  const trimmedId = userId.trim();
  return isUUID(trimmedId) || TELEGRAM_ID_PATTERN.test(trimmedId);
}

/** The trimmed id, or a ValidationError for an empty id or one that is no UUID and no Telegram id (#224). */
function checkedUserId(userId: string): string {
  const trimmedId = userId.trim();

  if (!trimmedId) {
    throw new ValidationError('userId is required', 'userId');
  }

  if (!isResolvableUserId(trimmedId)) {
    throw new ValidationError('userId must be a user UUID or a Telegram id', 'userId');
  }

  return trimmedId;
}

/**
 * Resolve a userId to UUID. There are no guests (decision Д4, #206): a UUID passes as it is, a Telegram id is resolved,
 * creating the user on first contact — so an HTTP route checks the id is the signed-in user's own (`verifyOwnership`)
 * before resolving it. Any other id is a ValidationError and creates no user (#224).
 *
 * @param userId - Can be telegramId (string of numbers) or UUID
 * @param userModule - UserModule instance for resolving telegramId to UUID
 * @returns UUID string (the id as given if resolution fails: fail-open)
 * @throws ValidationError for an empty id or one that is no UUID and no Telegram id
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
  const trimmedId = checkedUserId(userId);

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
 * Telegram flows until individual routes are explicitly migrated. An id that is
 * no UUID and no Telegram id is refused the same way in both (#224).
 */
export async function resolveUserIdToUUIDStrict(
  userId: string,
  userModule: UserModule
): Promise<string> {
  const trimmedId = checkedUserId(userId);

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
