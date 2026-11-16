/**
 * Shared Ownership Verification Utility
 *
 * Provides a generic, reusable way to verify that an authenticated user
 * owns a resource. Used by the transaction controller.
 *
 * Follows fail-closed pattern: denies access if verification cannot be completed.
 */

import { Request } from 'express';
import { ErrorFactory } from '../../domain/errors/AppError';
import { UserModule } from '../../../modules/user/userModule';
// Import for type extensions on Express.Request
import '../../../delivery/web/express/middleware/authMiddleware';

/**
 * Resource with userId - any entity that has an owner
 */
export interface OwnedResource {
  userId: string;
}

/**
 * Options for ownership verification
 */
export interface VerifyOwnershipOptions {
  /** Resource type name for error messages (e.g., 'transaction') */
  resourceType: string;
}

/**
 * Verify that the authenticated user owns the given resource.
 *
 * Fail-closed behavior:
 * - Throws if user is not authenticated
 * - Throws if userModule is not provided
 * - Throws if ownership cannot be verified
 *
 * @param req - Express request with telegramUser from auth middleware
 * @param resource - The resource to verify ownership of
 * @param userModule - UserModule for resolving telegramId to UUID
 * @param options - Verification options
 * @throws AuthorizationError if ownership verification fails
 */
export async function verifyResourceOwnership<T extends OwnedResource>(
  req: Request,
  resource: T,
  userModule: UserModule | undefined,
  options: VerifyOwnershipOptions
): Promise<void> {
  const { resourceType } = options;

  const telegramUser = req.telegramUser;

  // Fail-closed: require authentication
  if (!telegramUser) {
    throw ErrorFactory.authorization(`Authentication required to access this ${resourceType}`);
  }

  // Fail-closed: require userModule
  if (!userModule) {
    throw ErrorFactory.authorization(`Unable to verify ${resourceType} ownership`);
  }

  // Resolve telegramId to UUID and verify ownership
  const userResult = await userModule.getGetUserUseCase().execute({ telegramId: telegramUser.id.toString() });

  if (!userResult.success || !userResult.data || resource.userId !== userResult.data.id) {
    throw ErrorFactory.authorization(`You do not have permission to access this ${resourceType}`);
  }
}
