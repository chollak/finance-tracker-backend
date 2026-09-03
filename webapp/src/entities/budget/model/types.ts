// Re-export budget types from shared
export type {
  Budget,
  BudgetSummary,
  BudgetPeriod,
  CreateBudgetDTO,
  UpdateBudgetDTO,
} from '@/shared/types';

import type { BudgetSummary } from '@/shared/types';

/**
 * Burn-down forecast status.
 * `exceeded` is the only state rendered in red — `risk` is a warning about
 * a projection, not a missed deadline (FT-055).
 */
export type BudgetForecastStatus = 'on-track' | 'risk' | 'exceeded' | null;

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
  _periodText: string;              // "Август 2026 • 31.07–30.08", "Недельный • 03.08–09.08"

  // Actionable headline fields (main answer: what can I do now?)
  _remainingLabel: string;          // "Осталось" or "Перерасход"
  _remainingAmountText: string;     // "250 000 сўм" (remaining, or overspent amount if over budget)
  _remainingColor: string;          // "text-success", "text-warning", "text-expense"
  _timeContextText: string;         // "Ещё 19 дней до 30 августа" — the card's only days-left line

  // Burn-down forecast fields
  _dailySpendingRate: number;       // Daily spending rate
  _projectedRunoutDate: string | null; // "25 янв" - when budget will run out
  _forecastText: string | null;     // "Прогноз: хватит до конца месяца" / "Риск: лимит закончится 25 янв"
  _forecastStatus: BudgetForecastStatus;
}
