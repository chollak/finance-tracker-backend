// Re-export alert types from shared
export type { Alert, AlertType, AlertSeverity } from '@/shared/types';

import type { Alert } from '@/shared/types';

// ViewModel with formatted fields for UI
export interface AlertViewModel extends Alert {
  // Formatted fields with _ prefix (View Model Pattern)
  _severityColor: string;     // "text-red-600", "text-yellow-600", etc.
  _severityBg: string;        // "bg-red-50", "bg-yellow-50", etc.
  _iconEmoji: string;         // "🚨", "⚠️", "ℹ️"
  _typeLabel: string;         // "Бюджет превышен", "Необычные расходы", etc.
}
