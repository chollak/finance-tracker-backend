/**
 * Отклик вибрацией. Работает только на телефоне внутри Telegram,
 * в браузере молча ничего не делает.
 */
type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type NotificationType = 'error' | 'success' | 'warning';

function haptics() {
  return window.Telegram?.WebApp?.HapticFeedback;
}

export function hapticImpact(style: ImpactStyle = 'light') {
  haptics()?.impactOccurred(style);
}

export function hapticNotification(type: NotificationType) {
  haptics()?.notificationOccurred(type);
}

export function hapticSelection() {
  haptics()?.selectionChanged();
}
