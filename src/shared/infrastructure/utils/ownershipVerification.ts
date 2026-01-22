/**
 * Shared Ownership Verification Utility
 *
 * Provides a generic, reusable way to verify that an authenticated user
 * owns a resource. Used across Budget, Debt, and Transaction controllers.
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
  /** Resource type name for error messages (e.g., 'budget', 'debt', 'transaction') */
  resourceType: string;
  /** Allow guest users (userId starting with 'guest_') to bypass verification */
  allowGuest?: boolean;
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
  const { resourceType, allowGuest = false } = options;

  // Allow guest users to bypass if configured
  if (allowGuest && resource.userId.startsWith('guest_')) {
    return;
  }

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

/**
 * Helper to verify ownership and return the resource in one call.
 * Fetches the resource, verifies ownership, and returns it.
 *
 * @param req - Express request
 * @param fetchResource - Async function to fetch the resource by ID
 * @param userModule - UserModule for ownership verification
 * @param options - Verification options
 * @returns The verified resource
 * @throws NotFoundError if resource doesn't exist
 * @throws AuthorizationError if ownership verification fails
 */
export async function verifyAndGetResource<T extends OwnedResource>(
  req: Request,
  fetchResource: () => Promise<T | null>,
  userModule: UserModule | undefined,
  options: VerifyOwnershipOptions
): Promise<T> {
  const resource = await fetchResource();

  if (!resource) {
    throw ErrorFactory.notFound(`${capitalize(options.resourceType)} not found`);
  }

  await verifyResourceOwnership(req, resource, userModule, options);

  return resource;
}

/**
 * Capitalize first letter of a string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
