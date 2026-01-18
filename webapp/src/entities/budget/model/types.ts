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
  _progressColor: string;           // "bg-success", "bg-warning", "bg-expense"
  _statusText: string;              // "На пути", "Превышен", "Близко к лимиту"
  _statusColor: string;             // "text-success bg-success-muted", "text-expense bg-expense-muted"
  _daysRemainingText: string;       // "5 дней осталось"
  _periodText: string;              // "Месячный", "Недельный"

  // Velocity prediction fields
  _dailySpendingRate: number;       // Daily spending rate
  _projectedRunoutDate: string | null; // "25 янв" - when budget will run out
  _velocityText: string | null;     // "Хватит до: 25 янв" or "При текущем темпе: закончится 25 янв"
  _velocityStatus: 'on-track' | 'warning' | 'danger' | null;  // Velocity status
}
