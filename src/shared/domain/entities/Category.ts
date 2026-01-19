/**
 * Category Entity - Single Source of Truth
 *
 * Все категории определены здесь. Используется:
 * - Backend: OpenAI prompts, budget matching, transactions
 * - Frontend: UI категории (копия данных)
 * - Telegram: quick categories
 *
 * Архитектура готова для будущих динамических категорий (из БД).
 */

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  icon: string;
  aliases: string[];
}

// =============================================================================
// EXPENSE CATEGORIES
// =============================================================================

export const EXPENSE_CATEGORIES: Category[] = [
  // Еда и напитки
  {
    id: 'food',
    name: 'Еда',
    type: 'expense',
    icon: '🍔',
    aliases: ['еда', 'ресторан', 'кафе', 'обед', 'ужин', 'завтрак', 'перекус', 'food'],
  },
  {
    id: 'groceries',
    name: 'Продукты',
    type: 'expense',
    icon: '🛒',
    aliases: ['продукты', 'магазин', 'супермаркет', 'базар', 'рынок', 'groceries'],
  },
  {
    id: 'restaurants',
    name: 'Рестораны',
    type: 'expense',
    icon: '🍽️',
    aliases: ['ресторан', 'доставка', 'evos', 'maxway', 'kfc', 'mcdonald', 'restaurants'],
  },
  {
    id: 'coffee',
    name: 'Кофе',
    type: 'expense',
    icon: '☕',
    aliases: ['кофе', 'чай', 'кофейня', 'coffee'],
  },

  // Транспорт
  {
    id: 'transport',
    name: 'Транспорт',
    type: 'expense',
    icon: '🚗',
    aliases: ['транспорт', 'проезд', 'дорога', 'transport'],
  },
  {
    id: 'taxi',
    name: 'Такси',
    type: 'expense',
    icon: '🚕',
    aliases: ['такси', 'яндекс', 'uber', 'yandex go', 'yandex', 'taxi'],
  },
  {
    id: 'public-transport',
    name: 'Общ. транспорт',
    type: 'expense',
    icon: '🚌',
    aliases: ['метро', 'автобус', 'трамвай', 'маршрутка', 'public-transport'],
  },
  {
    id: 'fuel',
    name: 'Топливо',
    type: 'expense',
    icon: '⛽',
    aliases: ['бензин', 'топливо', 'заправка', 'азс', 'fuel'],
  },

  // Жилье и коммунальные
  {
    id: 'utilities',
    name: 'Коммунальные',
    type: 'expense',
    icon: '💡',
    aliases: ['коммунальные', 'свет', 'электричество', 'вода', 'отопление', 'коммуналка', 'utilities'],
  },
  {
    id: 'rent',
    name: 'Аренда',
    type: 'expense',
    icon: '🏠',
    aliases: ['аренда', 'квартира', 'жилье', 'квартплата', 'съем', 'rent'],
  },
  {
    id: 'internet',
    name: 'Интернет',
    type: 'expense',
    icon: '🌐',
    aliases: ['интернет', 'связь', 'мобильный', 'телефон', 'internet'],
  },

  // Покупки
  {
    id: 'shopping',
    name: 'Покупки',
    type: 'expense',
    icon: '🛍️',
    aliases: ['покупки', 'шоппинг', 'товары', 'shopping'],
  },
  {
    id: 'clothing',
    name: 'Одежда',
    type: 'expense',
    icon: '👔',
    aliases: ['одежда', 'обувь', 'аксессуары', 'clothing'],
  },
  {
    id: 'electronics',
    name: 'Электроника',
    type: 'expense',
    icon: '📱',
    aliases: ['электроника', 'техника', 'гаджеты', 'компьютер', 'electronics'],
  },

  // Развлечения
  {
    id: 'entertainment',
    name: 'Развлечения',
    type: 'expense',
    icon: '🎬',
    aliases: ['развлечения', 'кино', 'театр', 'концерт', 'отдых', 'entertainment'],
  },
  {
    id: 'hobbies',
    name: 'Хобби',
    type: 'expense',
    icon: '🎮',
    aliases: ['хобби', 'игры', 'увлечения', 'hobbies'],
  },
  {
    id: 'sports',
    name: 'Спорт',
    type: 'expense',
    icon: '⚽',
    aliases: ['спорт', 'тренировка', 'зал', 'sports'],
  },

  // Здоровье
  {
    id: 'health',
    name: 'Здоровье',
    type: 'expense',
    icon: '🏥',
    aliases: ['здоровье', 'врач', 'больница', 'клиника', 'анализы', 'health'],
  },
  {
    id: 'pharmacy',
    name: 'Аптека',
    type: 'expense',
    icon: '💊',
    aliases: ['аптека', 'лекарства', 'медикаменты', 'таблетки', 'pharmacy'],
  },
  {
    id: 'fitness',
    name: 'Фитнес',
    type: 'expense',
    icon: '🏋️',
    aliases: ['фитнес', 'спортзал', 'тренажерка', 'йога', 'fitness'],
  },

  // Образование
  {
    id: 'education',
    name: 'Образование',
    type: 'expense',
    icon: '📚',
    aliases: ['образование', 'учеба', 'курсы', 'книги', 'обучение', 'education'],
  },
  {
    id: 'courses',
    name: 'Курсы',
    type: 'expense',
    icon: '🎓',
    aliases: ['курсы', 'тренинг', 'мастер-класс', 'courses'],
  },

  // Прочее
  {
    id: 'bills',
    name: 'Счета',
    type: 'expense',
    icon: '📄',
    aliases: ['счета', 'платежи', 'оплата', 'bills'],
  },
  {
    id: 'subscriptions',
    name: 'Подписки',
    type: 'expense',
    icon: '📺',
    aliases: ['подписки', 'netflix', 'spotify', 'youtube', 'subscriptions'],
  },
  {
    id: 'gifts-expense',
    name: 'Подарки',
    type: 'expense',
    icon: '🎁',
    aliases: ['подарок', 'подарки', 'сюрприз'],
  },
  {
    id: 'other',
    name: 'Другое',
    type: 'expense',
    icon: '📦',
    aliases: ['другое', 'прочее', 'разное', 'other'],
  },
];

// =============================================================================
// INCOME CATEGORIES
// =============================================================================

export const INCOME_CATEGORIES: Category[] = [
  {
    id: 'salary',
    name: 'Зарплата',
    type: 'income',
    icon: '💰',
    aliases: ['зарплата', 'зп', 'оклад', 'аванс', 'salary'],
  },
  {
    id: 'freelance',
    name: 'Фриланс',
    type: 'income',
    icon: '💼',
    aliases: ['фриланс', 'подработка', 'халтура', 'заказ', 'freelance'],
  },
  {
    id: 'investment',
    name: 'Инвестиции',
    type: 'income',
    icon: '📈',
    aliases: ['инвестиции', 'дивиденды', 'проценты', 'доход', 'investment'],
  },
  {
    id: 'gift',
    name: 'Подарок',
    type: 'income',
    icon: '🎁',
    aliases: ['подарок', 'дарение', 'помощь', 'gift'],
  },
  {
    id: 'refund',
    name: 'Возврат',
    type: 'income',
    icon: '↩️',
    aliases: ['возврат', 'кэшбэк', 'cashback', 'refund'],
  },
  {
    id: 'bonus',
    name: 'Бонус',
    type: 'income',
    icon: '🏆',
    aliases: ['бонус', 'премия', 'награда', 'bonus'],
  },
  {
    id: 'other-income',
    name: 'Другое',
    type: 'income',
    icon: '📦',
    aliases: ['другое', 'прочее', 'other-income'],
  },
];

// =============================================================================
// TRANSFER CATEGORY
// =============================================================================

export const TRANSFER_CATEGORY: Category = {
  id: 'transfer',
  name: 'Перевод',
  type: 'both',
  icon: '💸',
  aliases: ['перевод', 'трансфер', 'transfer'],
};

// =============================================================================
// DEBT CATEGORY
// =============================================================================

export const DEBT_CATEGORY: Category = {
  id: 'debt',
  name: 'Долг',
  type: 'both',
  icon: '🤝',
  aliases: ['долг', 'займ', 'ссуда', 'debt', 'loan'],
};

// =============================================================================
// ALL CATEGORIES
// =============================================================================

export const ALL_CATEGORIES: Category[] = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
  TRANSFER_CATEGORY,
  DEBT_CATEGORY,
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Найти категорию по ID
 */
export function getCategoryById(id: string): Category | undefined {
  return ALL_CATEGORIES.find((c) => c.id === id);
}

/**
 * Найти категорию по алиасу (русское название, английское название, варианты)
 * Используется для нормализации категорий от OpenAI
 */
export function getCategoryByAlias(alias: string): Category | undefined {
  const normalized = alias.toLowerCase().trim();

  return ALL_CATEGORIES.find(
    (c) =>
      c.id === normalized ||
      c.name.toLowerCase() === normalized ||
      c.aliases.some((a) => a.toLowerCase() === normalized)
  );
}

/**
 * Нормализовать категорию - всегда возвращает ID
 * Если категория не найдена, возвращает 'other'
 */
export function normalizeCategory(category: string): string {
  const found = getCategoryById(category) || getCategoryByAlias(category);
  return found?.id || 'other';
}

/**
 * Получить категории по типу
 */
export function getCategoriesByType(type: 'income' | 'expense'): Category[] {
  return ALL_CATEGORIES.filter((c) => c.type === type || c.type === 'both');
}

/**
 * Генерировать список категорий для OpenAI prompt
 * OpenAI должен использовать ТОЛЬКО ID из этого списка
 */
export function generateCategoryPrompt(): string {
  const expenseLines = EXPENSE_CATEGORIES.map(
    (c) => `  - ${c.id} (${c.name}: ${c.aliases.slice(0, 4).join(', ')})`
  );

  const incomeLines = INCOME_CATEGORIES.map(
    (c) => `  - ${c.id} (${c.name}: ${c.aliases.slice(0, 3).join(', ')})`
  );

  return `КАТЕГОРИИ РАСХОДОВ (используй ТОЛЬКО ID):
${expenseLines.join('\n')}

КАТЕГОРИИ ДОХОДОВ (используй ТОЛЬКО ID):
${incomeLines.join('\n')}`;
}
