// Re-export budget types from shared
export type {
  Budget,
  BudgetSummary,
  BudgetPeriod,
  CreateBudgetDTO,
  UpdateBudgetDTO,
} from '@/shared/types';

import type { BudgetSummary } from '@/shared/types';

// ViewModel with formatted fields for UI
export interface BudgetViewModel extends BudgetSummary {
  // Formatted fields with _ prefix (View Model Pattern)
  _formattedAmount: string;         // "1 000 000 сўм"
  _formattedSpent: string;          // "750 000 сўм"
  _formattedRemaining: string;      // "250 000 сўм"
  _percentageText: string;          // "75%"
  _progressColor: string;           // "bg-green-500", "bg-yellow-500", "bg-red-500"
  _statusText: string;              // "На пути", "Превышен", "Близко к лимиту"
  _statusColor: string;             // "text-green-600", "text-red-600"
  _daysRemainingText: string;       // "5 дней осталось"
  _periodText: string;              // "Месячный", "Недельный"
}
