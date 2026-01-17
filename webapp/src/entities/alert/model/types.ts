// Re-export alert types from shared
export type { Alert, AlertType, AlertSeverity } from '@/shared/types';

import type { Alert } from '@/shared/types';

type LucideIconName = 'AlertCircle' | 'AlertTriangle' | 'Bell' | 'Info';

// ViewModel with formatted fields for UI
export interface AlertViewModel extends Alert {
  // Formatted fields with _ prefix (View Model Pattern)
  _severityColor: string;     // "text-expense", "text-warning", etc.
  _severityBg: string;        // "bg-expense-muted", "bg-warning-muted", etc.
  _iconName: LucideIconName;  // Lucide icon name
  _iconColor: string;         // Icon color class
  _typeLabel: string;         // "Бюджет превышен", "Необычные расходы", etc.
}
