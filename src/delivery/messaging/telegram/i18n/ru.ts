import { QuickCategory } from '../types';
import { EXPENSE_CATEGORIES } from '../../../../shared/domain/entities/Category';

// Generate quick categories from shared Category entity
const QUICK_CATEGORIES: QuickCategory[] = EXPENSE_CATEGORIES.slice(0, 8).map((c) => ({
  id: c.id,
  emoji: c.icon,
  name: c.name,
}));

/**
 * Russian language strings for Telegram bot
 */
export const RU = {
  // Welcome and onboarding
  welcome: {
    title: 'AI Finance Tracker',
    greeting: (name: string) => `Привет, ${name}!`,
    description: `
Я помогу отслеживать твои расходы и доходы.

<b>Как пользоваться:</b>
Отправь голосовое сообщение или текст
Например: <i>кофе 350</i> или <i>зарплата 50000</i>

<b>Команды:</b>
/today - Расходы за сегодня
/stats - Статистика за месяц
/budget - Состояние бюджетов
/help - Помощь
    `.trim(),
    openApp: 'Открыть приложение',
    quickAdd: 'Быстрое добавление:',
  },

  // Command responses
  commands: {
    today: {
      title: 'Сегодня',
      noTransactions: 'Сегодня транзакций пока нет',
      total: (amount: string) => `Итого: ${amount}`,
      income: (amount: string) => `Доход: +${amount}`,
      expense: (amount: string) => `Расход: ${amount}`,
      count: (n: number) => `Транзакций: ${n}`,
    },
    stats: {
      title: (month: string) => `Статистика за ${month}`,
      income: 'Доходы',
      expenses: 'Расходы',
      balance: 'Баланс',
      transactions: 'Транзакций',
      topCategories: 'Топ категории',
      savingsRate: (rate: number) => `Норма сбережений: ${rate}%`,
      noData: 'Нет данных за этот период',
    },
    budget: {
      title: 'Бюджеты',
      noBudgets: 'У вас пока нет бюджетов.\nСоздайте первый в приложении!',
      status: (name: string, spent: string, limit: string, percentage: number) =>
        `${name}: ${spent} / ${limit} (${percentage}%)`,
      exceeded: 'Превышен!',
      warning: 'Внимание!',
      ok: 'OK',
      remaining: (amount: string) => `Осталось: ${amount}`,
    },
    help: {
      title: 'Справка',
      content: `
<b>Как добавлять транзакции:</b>

<b>Голосом:</b>
<i>"Потратил 500 рублей на такси"</i>
<i>"Получил зарплату 80000"</i>

<b>Текстом:</b>
<i>кофе 350</i>
<i>продукты 2500</i>
<i>+50000 зарплата</i> (+ для дохода)

<b>Команды:</b>
/today - Расходы за сегодня
/stats - Статистика за месяц
/budget - Состояние бюджетов

<b>Быстрое добавление:</b>
Нажмите на категорию ниже
      `.trim(),
    },
  },

  // Transaction messages
  transaction: {
    autoSaved: 'Сохранено',
    confirmRequired: 'Подтвердите',
    confidence: (value: number) => `Уверенность: ${value}%`,
    amount: 'Сумма',
    category: 'Категория',
    type: 'Тип',
    merchant: 'Место',
    income: 'Доход',
    expense: 'Расход',
    confirmed: 'Подтверждено',
    deleted: 'Удалено',
    noTransactions: 'Транзакций не найдено',
    todaySummary: (amount: string) => `Сегодня: ${amount}`,
    monthSummary: (amount: string) => `Месяц: ${amount}`,
  },

  // Buttons
  buttons: {
    confirm: 'Подтвердить',
    edit: 'Изменить',
    delete: 'Удалить',
    viewAll: 'Все транзакции',
    openApp: 'Открыть приложение',
    back: 'Назад',
    cancel: 'Отмена',
    moreStats: 'Подробная аналитика',
    allBudgets: 'Все бюджеты',
    createBudget: 'Создать бюджет',
  },

  // Quick categories for inline keyboard (synced with shared Category entity)
  quickCategories: {
    title: 'Быстрое добавление:',
    selectCategory: 'Выберите категорию:',
    enterAmount: (category: string) => `${category}\n\nВведите сумму:`,
    categories: QUICK_CATEGORIES,
  },

  // Errors
  errors: {
    generic: 'Произошла ошибка. Попробуйте снова.',
    noTransactionFound: 'Транзакция не найдена.',
    cannotDelete: 'Можно удалить только последнюю транзакцию.',
    voiceProcessing: 'Не удалось обработать голосовое сообщение.',
    invalidCommand: 'Неизвестная команда.',
    emptyMessage: 'Пожалуйста, отправьте сообщение с транзакцией.',
    webAppNotConfigured: 'Приложение не настроено.',
  },

  // Months
  months: [
    'январь', 'февраль', 'март', 'апрель',
    'май', 'июнь', 'июль', 'август',
    'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
  ],
} as const;

/**
 * Get month name in Russian
 */
export function getMonthName(date: Date): string {
  return RU.months[date.getMonth()];
}

/**
 * Format currency amount
 */
export function formatAmount(amount: number, showSign = false): string {
  const fmt = new Intl.NumberFormat('ru-RU');
  const formatted = fmt.format(Math.abs(amount));

  if (showSign && amount > 0) {
    return `+${formatted}`;
  }
  if (amount < 0) {
    return `-${formatted}`;
  }
  return formatted;
}

export type I18nKey = keyof typeof RU;
