/**
 * Guest ID Utilities
 * Handles generation and detection of guest user IDs
 */

const GUEST_PREFIX = 'guest_';

/**
 * Generate a new guest user ID
 * Format: guest_{UUID}
 */
export function generateGuestId(): string {
  return `${GUEST_PREFIX}${crypto.randomUUID()}`;
}

/**
 * Check if a user ID is a guest ID
 */
export function isGuestId(userId: string): boolean {
  return userId.startsWith(GUEST_PREFIX);
}

/**
 * Extract the UUID part from a guest ID
 */
export function extractGuestUUID(guestId: string): string | null {
  if (!isGuestId(guestId)) {
    return null;
  }
  return guestId.slice(GUEST_PREFIX.length);
}

/**
 * Check if a user ID looks like a Telegram ID (numeric string)
 */
export function isTelegramId(userId: string): boolean {
  return /^\d+$/.test(userId);
}
