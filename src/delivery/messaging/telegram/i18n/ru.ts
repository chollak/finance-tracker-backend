
/**
 * Russian language strings for Telegram bot
 */
export const RU = {
  // The boards «Бот · первое сообщение» and «Бот · меню команд» (FT-124)
  commands: {
    start: '<b>Это Kapelka — учёт расходов и доходов.</b>\nПишите траты прямо сюда, как в заметках:\n'
      + '<blockquote><i>кофе 25к, такси 18к нал</i></blockquote>\n\n'
      + 'Можно голосом. Всё сразу попадёт в приложение.\n\n<i>Команды — «/» в поле ввода.</i>',
    help: [
      '<b>Как записывать</b>',
      'Трата и сумма: «такси 18к», «обед 45\u00a0000 картой».',
      'Несколько сразу — через запятую.',
      'Доход: «зарплата 12,5 млн». Доллары: «наушники 55$».',
      'Не сегодня — добавьте «вчера» или дату.',
      'Поменять сумму — напишите «не 25, а 28».',
      '',
      '/today — итоги дня',
      '/month — траты за месяц',
      '/undo — отменить последнюю запись',
    ].join('\n'),
    unknown: 'Такой команды нет. Список — /help',
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

  // A quick-add category button of a message sent before FT-124: the amount comes next
  quickCategories: {
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
    // FT-224: «25000 300» is two numbers, not 25 000 300
    amountOneNumber: 'Сумма — одно число. Напишите её ещё раз — например, 25 000 или 25к.',
    noAccountIn: (currency: 'UZS' | 'USD') =>
      currency === 'USD' ? 'Счёта в долларах нет — добавьте его в Kapelka.' : 'Счёта в сумах нет — добавьте его в Kapelka.',
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
    // The AI or the speech recognition did not answer (no network, a model withdrawn): nothing was written
    aiUnavailable: 'Не получилось разобрать — сервис распознавания сейчас не ответил, поэтому не записал.\n'
      + 'Попробуйте ещё раз через минуту или напишите проще: <i>такси 18к</i>.',
    voiceProcessing: 'Не удалось обработать голосовое сообщение.',
    emptyMessage: 'Пожалуйста, отправьте сообщение с транзакцией.',
  },

} as const;

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
