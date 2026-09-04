import type { Debt } from '@/shared/types';
import { formatCurrency, formatRelativeDate } from '@/shared/lib/formatters';
import type { DebtViewModel } from '../model/types';

/**
 * Transform a Debt entity to a ViewModel with formatted fields
 */
export function debtToViewModel(debt: Debt): DebtViewModel {
  const isIOwe = debt.type === 'i_owe';
  const isPaid = debt.status === 'paid';
  const isCancelled = debt.status === 'cancelled';
  const isOverdue = debt.dueDate && new Date(debt.dueDate) < new Date() && debt.status === 'active';
  const progressPercent = debt.originalAmount > 0
    ? Math.round(((debt.originalAmount - debt.remainingAmount) / debt.originalAmount) * 100)
    : 0;

  return {
    ...debt,
    // Formatted fields with _ prefix (View Model Pattern)
    _formattedOriginalAmount: formatCurrency(debt.originalAmount),
    _formattedRemainingAmount: formatCurrency(debt.remainingAmount),
    _formattedPaidAmount: formatCurrency(debt.originalAmount - debt.remainingAmount),
    _formattedDate: formatRelativeDate(debt.createdAt),
    _formattedDueDate: debt.dueDate ? formatRelativeDate(debt.dueDate) : undefined,
    _typeLabel: isIOwe ? 'Я должен' : 'Мне должны',
    _typeIcon: isIOwe ? '📤' : '📥',
    _statusLabel: isPaid ? 'Погашен' : isCancelled ? 'Отменён' : 'Активен',
    // Status maps onto existing semantic roles only: paid = success, cancelled = muted,
    // active = neutral chrome. Overdue is signalled separately by the card (FT-059).
    _statusColor: isPaid ? 'text-success' : isCancelled ? 'text-muted-foreground' : 'text-foreground',
    _progressPercent: progressPercent,
    _isOverdue: isOverdue || false,
    _amountColor: isIOwe ? 'text-expense' : 'text-income',
  };
}
