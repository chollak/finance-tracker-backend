/**
 * Haptic Feedback utility for Telegram Mini Apps
 * Non-hook version that can be called from anywhere (mutations, event handlers, etc.)
 *
 * Works only on mobile devices in Telegram client.
 * Silently does nothing in browser/desktop.
 */

type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type NotificationType = 'error' | 'success' | 'warning';

function getHapticFeedback() {
  return window.Telegram?.WebApp?.HapticFeedback;
}

/**
 * Trigger impact haptic feedback
 * Use for button presses, toggles, UI interactions
 */
export function hapticImpact(style: ImpactStyle = 'light') {
  getHapticFeedback()?.impactOccurred(style);
}

/**
 * Trigger notification haptic feedback
 * Use for success/error/warning states after operations
 */
export function hapticNotification(type: NotificationType) {
  getHapticFeedback()?.notificationOccurred(type);
}

/**
 * Trigger selection changed haptic feedback
 * Use for tab switches, picker changes, selection updates
 */
export function hapticSelection() {
  getHapticFeedback()?.selectionChanged();
}

/**
 * Check if haptic feedback is available
 */
export function isHapticAvailable(): boolean {
  return !!getHapticFeedback();
}

/**
 * Pre-configured haptic patterns for common actions
 */
export const haptic = {
  // UI interactions
  tap: () => hapticImpact('light'),
  press: () => hapticImpact('medium'),
  heavyPress: () => hapticImpact('heavy'),

  // State changes
  success: () => hapticNotification('success'),
  error: () => hapticNotification('error'),
  warning: () => hapticNotification('warning'),

  // Navigation
  selectionChanged: () => hapticSelection(),
  tabChanged: () => hapticSelection(),
};
