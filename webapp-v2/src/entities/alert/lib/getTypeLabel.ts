import type { AlertType } from '@/shared/types';

/**
 * Gets Russian label for alert type
 */
export function getTypeLabel(type: AlertType): string {
  const TYPE_LABELS: Record<string, string> = {
    BUDGET_EXCEEDED: 'Бюджет превышен',
    BUDGET_NEAR_LIMIT: 'Близко к лимиту бюджета',
    UNUSUAL_SPENDING: 'Необычные расходы',
    HIGH_CATEGORY_SPENDING: 'Высокие расходы в категории',
    LOW_SAVINGS_RATE: 'Низкий уровень сбережений',
    SPENDING_TREND_UP: 'Рост расходов',
  };

  return TYPE_LABELS[type] || type;
}
