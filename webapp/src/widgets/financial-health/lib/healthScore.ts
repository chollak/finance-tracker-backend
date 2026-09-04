export interface HealthScoreInfo {
  /** Text role class for the number and the label */
  color: string;
  /** Progress indicator class — always the same role as `color` */
  barColor: string;
  label: string;
  description: string;
}

/**
 * Map a 0..100 health score onto one semantic role.
 *
 * The number, the label and the progress bar all read the same value, so they all use
 * the same role (FT-059). Warning/orange starts where the copy actually asks for
 * attention — a "Хорошо" score is not a warning, it is a plain neutral state.
 */
export function getHealthScoreInfo(score: number): HealthScoreInfo {
  if (score >= 80) {
    return {
      color: 'text-success',
      barColor: 'bg-success',
      label: 'Отлично',
      description: 'Ваше финансовое здоровье в отличном состоянии',
    };
  }
  if (score >= 60) {
    return {
      color: 'text-primary',
      barColor: 'bg-primary',
      label: 'Хорошо',
      description: 'Финансовое состояние стабильное, но есть куда расти',
    };
  }
  if (score >= 40) {
    return {
      color: 'text-warning',
      barColor: 'bg-warning',
      label: 'Средне',
      description: 'Рекомендуем пересмотреть расходы и увеличить накопления',
    };
  }
  return {
    color: 'text-expense',
    barColor: 'bg-expense',
    label: 'Требует внимания',
    description: 'Финансовое здоровье нуждается в улучшении',
  };
}
