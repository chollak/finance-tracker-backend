/**
 * Форма транзакции, как её реально отдаёт API.
 *
 * Старый фронт отстал от бэкенда: в его типе не было isDebtRelated,
 * relatedDebtId и source, а originalParsing не содержал semanticType
 * и needsReview, хотя бэкенд их туда пишет. Расхождение типа с реальностью
 * тише бага, но обходится так же дорого — на нём строятся расчёты.
 */

/** Смысл операции. Расходом является ровно один из восьми. */
export type SemanticType =
  | 'expense'
  | 'income'
  | 'own_transfer'
  | 'saving_deposit'
  | 'debt'
  | 'reimbursement'
  | 'cash_withdrawal'
  | 'group_payment';

/** Канал, через который запись попала в систему. */
export type TransactionSource = 'telegram' | 'shortcut' | 'webapp';

export interface OriginalParsing {
  amount: number;
  category: string;
  type: 'income' | 'expense';
  semanticType?: SemanticType;
  needsReview?: boolean;
  merchant?: string;
  confidence?: number;
}

export interface Transaction {
  id: string;
  amount: number;
  /** Направление денежного потока. Для «что считать расходом» не годится — см. semanticType. */
  type: 'income' | 'expense';
  /** Всегда заполнен: оба репозитория нормализуют его на выходе. */
  semanticType: SemanticType;
  needsReview: boolean;
  description: string;
  /** Всегда календарный день YYYY-MM-DD. День здесь — UTC-день, см. lib/dates. */
  date: string;
  userId: string;
  category: string;
  isArchived: boolean;
  /** Приходит всегда; в сводке НЕ используется — бот его тоже не фильтрует. */
  isDebtRelated: boolean;
  createdAt?: string;
  userName?: string;
  merchant?: string;
  confidence?: number;
  /** Исходная фраза. У записей, созданных формой, её нет. */
  originalText?: string;
  originalParsing?: OriginalParsing;
  relatedDebtId?: string;
  source?: TransactionSource;
}

/** Тело запроса на создание вручную (POST /api/transactions). */
export interface CreateTransactionInput {
  amount: number;
  category: string;
  description: string;
  type: 'income' | 'expense';
  /** Слать telegramId, не UUID: маршрут перезапишет его личностью из initData. */
  userId: string;
  date?: string;
  merchant?: string;
  semanticType?: SemanticType;
}

/**
 * Поля, которые принимает правка (PUT /api/transactions/:id).
 *
 * Белый список сервера шире и включает merchant, но обычный
 * UpdateTransactionUseCase его молча теряет: он деструктурирует
 * фиксированный набор без merchant и из него же собирает объект обновления.
 * Поэтому здесь merchant нет — обещать сохранение того, что не сохраняется,
 * хуже, чем не давать его править.
 */
export interface UpdateTransactionInput {
  amount?: number;
  category?: string;
  description?: string;
  date?: string;
  type?: 'income' | 'expense';
  semanticType?: SemanticType;
  needsReview?: boolean;
}

/** Ответ быстрого пути разбора (POST /api/voice/text-input). */
export interface CaptureResult {
  text: string;
  /**
   * Пусто означает, что разобрать не удалось. HTTP при этом 200:
   * упавшая при создании транзакция молча не попадает в массив.
   */
  transactions: Array<{
    id: string;
    amount: number;
    category: string;
    type: 'income' | 'expense';
    semanticType?: SemanticType;
    needsReview?: boolean;
    date: string;
    merchant?: string;
    confidence?: number;
    description?: string;
  }>;
  /** Долги создаются реально, но прочитать их нечем — маршрут /debts заморожен. */
  debts: Array<{ id: string; personName: string; amount: number }>;
}
