
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
/week - Еженедельный обзор
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
/week - Еженедельный обзор прошлой недели
/stats - Статистика за месяц
/budget - Состояние бюджетов

<b>Быстрое добавление:</b>
Нажмите на категорию ниже
      `.trim(),
    },
  },

  // Transaction messages (the confirmation itself is the record message, FT-122)
  transaction: {
    noTransactions: 'Транзакций не найдено',
  },

  // Debt messages
  debt: {
    created: '🤝 Долг записан',
    iOwe: 'Я должен',
    owedToMe: 'Мне должны',
    person: 'Кому',
    personFrom: 'Кто',
    amount: 'Сумма',
    dueDate: 'Вернуть до',
    noDueDate: 'без срока',
    withTransaction: '+ транзакция создана',
    noDebts: 'Долгов не найдено',
  },

  // Buttons
  buttons: {
    viewAll: 'Все транзакции',
    addTransaction: 'Добавить транзакцию',
    moreStats: 'Подробная аналитика',
    allBudgets: 'Все бюджеты',
    createBudget: 'Создать бюджет',
  },

  // Quick categories for inline keyboard (synced with shared Category entity)
  quickCategories: {
    title: 'Быстрое добавление:',
    selectCategory: 'Выберите категорию:',
    enterAmount: (category: string) => `${category}\n\nВведите сумму:`,
  },

  // Record messages (FT-122): what the bot says around its confirmations
  record: {
    notFound: 'Не нашёл эту запись.',
    nothingToUndo: 'Отменять нечего: записей из чата пока нет.',
    undone: (what: string) => `Отменил последнюю запись: ${what}`,
    reverted: (count: number) => (count > 1 ? 'Вернул записи.' : 'Вернул запись.'),
    amountNotPositive: 'Сумма должна быть больше нуля.',
    amountTooBig: 'Сумма слишком большая — проверьте её и напишите ещё раз.',
    noAccountIn: (currency: 'UZS' | 'USD') =>
      currency === 'USD' ? 'Счёта в долларах нет — добавьте его в Daftar.' : 'Счёта в сумах нет — добавьте его в Daftar.',
    // FT-123: what was named without an amount, «не 25, а 28»
    withoutAmountNotWritten: (name: string) => `${name} — без суммы, не записал.`,
    skipped: (name: string) => `${name} — пропустил.`,
    writtenSeparately: (name: string) => `${name} — записал отдельным сообщением.`,
    changed: (what: string) => `Изменил: ${what}`,
    correctionOnlyAmount: 'Так можно поменять только сумму: «не 25, а 28». Остальное — кнопка «Изменить» под записью.',
    correctionNotFound: (was: string) => `Не нашёл запись на ${was}. Нажмите «Изменить» под нужной.`,
    correctionWhich: 'Не понял, какую сумму менять. Напишите так: «не 25, а 28».',
    correctionNotAnAmount: 'Новая сумма должна быть числом больше нуля.',
  },

  // FT-123: nothing to write — with an example of what to write (board «Бот · не понял, не расслышал»)
  capture: {
    notUnderstood: 'Не нашёл, что записать.\nНапишите трату и сумму:\n'
      + '<blockquote><i>такси 18к, обед 45\u00a0000 картой</i></blockquote>\n\n<i>Подробнее — /help</i>',
    notHeard: 'Не расслышал.\nСкажите ещё раз — что купили и сколько, например: «такси восемнадцать тысяч». Или напишите текстом.',
  },

  // Errors
  errors: {
    generic: 'Произошла ошибка. Попробуйте снова.',
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
