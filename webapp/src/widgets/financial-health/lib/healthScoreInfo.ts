export interface HealthScoreInfo {
  color: string;
  bgColor: string;
  label: string;
  description: string;
}

/**
 * Maps a financial health score to a semantic role.
 *
 * `warning` stays reserved for scores that genuinely need attention. A good
 * score is neutral rather than orange — colouring it as a warning contradicts
 * its own label.
 */
export function getHealthScoreInfo(score: number): HealthScoreInfo {
  if (score >= 80) {
    return {
      color: 'text-success',
      bgColor: 'bg-success',
      label: 'Отлично',
      description: 'Ваше финансовое здоровье в отличном состоянии',
    };
  }

  if (score >= 60) {
    return {
      color: 'text-foreground',
      bgColor: 'bg-foreground',
      label: 'Хорошо',
      description: 'Финансовое состояние стабильное, но есть куда расти',
    };
  }

  if (score >= 40) {
    return {
      color: 'text-warning',
      bgColor: 'bg-warning',
      label: 'Средне',
      description: 'Рекомендуем пересмотреть расходы и увеличить накопления',
    };
  }

  return {
    color: 'text-expense',
    bgColor: 'bg-expense',
    label: 'Требует внимания',
    description: 'Финансовое здоровье нуждается в улучшении',
  };
}
