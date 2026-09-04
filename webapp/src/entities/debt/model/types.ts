// Re-export debt types from shared
export type {
  Debt,
  DebtPayment,
  DebtWithPayments,
  DebtSummary,
  CreateDebtDTO,
  UpdateDebtDTO,
  PayDebtDTO,
  DebtType,
  DebtStatus,
} from '@/shared/types';

import type { Debt } from '@/shared/types';

// ViewModel with formatted fields for UI
export interface DebtViewModel extends Debt {
  // Formatted fields with _ prefix (View Model Pattern)
  _formattedOriginalAmount: string;   // "50 000 сўм"
  _formattedRemainingAmount: string;  // "30 000 сўм"
  _formattedPaidAmount: string;       // "20 000 сўм"
  _formattedDate: string;             // "Сегодня" or "14 янв"
  _formattedDueDate?: string;         // "Через 5 дней" or "Просрочено"
  _typeLabel: string;                 // "Я должен" or "Мне должны"
  _typeIcon: string;                  // "📤" or "📥"
  _statusLabel: string;               // "Активен", "Погашен", "Отменён"
  _statusColor: string;               // semantic role class: "text-success" | "text-muted-foreground" | "text-foreground"
  _progressPercent: number;           // 0-100
  _isOverdue: boolean;                // true if past due date
  _amountColor: string;               // "text-expense" or "text-income"
}
