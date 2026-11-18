/**
 * User ID Resolution Helper
 *
 * Standardizes userId handling across the application.
 * Converts telegramId to UUID for consistency.
 */

import { UserModule } from '../../../modules/user/userModule';
import { createLogger, LogCategory } from '../logging';
import { StorageError, ValidationError } from '../../domain/errors/AppError';
import { telegramIdOf } from '../../domain/access/telegramAccess';

const logger = createLogger(LogCategory.USER);

/**
 * The user could not be looked up (#315): the database is busy, the disk. Whoever asked does nothing under a guessed
 * id — a capture is not written, a button changes nothing — and the same request can be sent again. A `StorageError`,
 * as a capture that could not be written is (#299): `500 INTERNAL_ERROR` with this message only, the cause is in the
 * log. A user who is not there yet is not this: a Telegram id creates them.
 */
export class UserLookupError extends StorageError {
  constructor() {
    super('The user could not be looked up, send it again');
  }
}

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
 * The id resolution looks the user up by, or null when it names no user (#224, #230): a UUID in lower case — ids are
 * stored so and looked up exactly; a Telegram id by the rule of ALLOWED_TELEGRAM_IDS (`telegramIdOf`) — a positive
 * whole number below 2^53, leading zeros name the same id (`0597843119` is `597843119`). Anything else (`abc`, `-5`,
 * `1.5`, `0`, an old guest id, 30 digits) would become a `users` row of no one. Spaces around the id are fine.
 */
export function resolvableUserIdOf(userId: string): string | null {
  const trimmedId = userId.trim();
  return isUUID(trimmedId) ? trimmedId.toLowerCase() : telegramIdOf(trimmedId);
}

/** The id to look the user up by, or a ValidationError for an empty id or one that names no user (#224, #230). */
function checkedUserId(userId: string): string {
  if (!userId.trim()) {
    throw new ValidationError('userId is required', 'userId');
  }

  const resolvableId = resolvableUserIdOf(userId);
  if (resolvableId === null) {
    throw new ValidationError('userId must be a user UUID or a Telegram id', 'userId');
  }

  return resolvableId;
}

/**
 * Resolve a userId to UUID. There are no guests (decision Д4, #206): a UUID passes in lower case, a Telegram id is
 * resolved, creating the user on first contact — so an HTTP route checks the id is the signed-in user's own
 * (`verifyOwnership`) before resolving it. Any other id is a ValidationError and creates no user (#224). A Telegram id
 * goes by `telegramIdOf`, as in ALLOWED_TELEGRAM_IDS: `0597843119` is the user of `597843119` (#230).
 *
 * @param userId - Can be telegramId (string of numbers) or UUID
 * @param userModule - UserModule instance for resolving telegramId to UUID
 * Fail-closed (#315): a lookup that fails throws, and nothing is read or written under the Telegram id. It used to
 * be returned as the user's id — a capture then wrote a record no screen and no total reads, for they read by the UUID.
 *
 * @returns UUID string
 * @throws ValidationError for an empty id or one that is no UUID and no Telegram id
 * @throws UserLookupError when the lookup itself fails
 *
 * @example
 * // telegramId → UUID
 * resolveUserIdToUUID("123456789", userModule) → "a1b2c3d4-e5f6-..."
 * resolveUserIdToUUID("0123456789", userModule) → the same "a1b2c3d4-e5f6-..."
 *
 * // Already UUID → returns it, in lower case
 * resolveUserIdToUUID("a1b2c3d4-e5f6-...", userModule) → "a1b2c3d4-e5f6-..."
 */
export async function resolveUserIdToUUID(
  userId: string,
  userModule: UserModule
): Promise<string> {
  const resolvableId = checkedUserId(userId);

  // Already a UUID (in lower case) - return it
  if (isUUID(resolvableId)) {
    return resolvableId;
  }

  // Resolve telegramId to UUID via UserModule
  try {
    const user = await userModule.getGetOrCreateUserUseCase().execute({
      telegramId: resolvableId,
    });
    return user.id;
  } catch (error) {
    logger.error(`Failed to resolve userId "${resolvableId}" to UUID`, error as Error);
    throw new UserLookupError();
  }
}
