import type { Alert } from '@/shared/types';
import type { AlertViewModel } from '../model/types';
import { getSeverityColor } from './getSeverityColor';
import { getTypeLabel } from './getTypeLabel';

/**
 * Transforms Alert to AlertViewModel
 * Adds formatted fields with _ prefix for direct UI rendering
 */
export function alertToViewModel(alert: Alert): AlertViewModel {
  const colors = getSeverityColor(alert.severity);

  return {
    ...alert,
    _severityColor: colors.text,
    _severityBg: colors.bg,
    _iconEmoji: colors.icon,
    _typeLabel: getTypeLabel(alert.type),
  };
}
