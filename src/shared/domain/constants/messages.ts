/**
 * Application messages and prompts
 * Centralized for easy translation and maintenance
 */

export const ERROR_MESSAGES = {
  // Generic
  INTERNAL_ERROR: 'Internal server error',
  INVALID_REQUEST: 'Invalid request data',
  UNAUTHORIZED: 'Unauthorized access',
  
  // Configuration
  MISSING_API_KEY: 'API key is missing or invalid',
  INVALID_CONFIG: 'Invalid configuration',
  
  // Transactions
  TRANSACTION_NOT_FOUND: 'Transaction not found',
  TRANSACTION_CREATE_FAILED: 'Failed to create transaction',
  TRANSACTION_UPDATE_FAILED: 'Failed to update transaction',
  TRANSACTION_DELETE_FAILED: 'Failed to delete transaction',
  
  // External services
  OPENAI_ERROR: 'OpenAI service unavailable',
  TELEGRAM_ERROR: 'Telegram service unavailable',
  
  // File processing
  INVALID_FILE_FORMAT: 'Invalid file format',
  FILE_TOO_LARGE: 'File size exceeds limit',
  FILE_PROCESSING_FAILED: 'Failed to process file',
  
  // Voice processing
  TRANSCRIPTION_FAILED: 'Voice transcription failed',
  VOICE_PROCESSING_FAILED: 'Voice processing failed',
} as const;

export const SUCCESS_MESSAGES = {
  TRANSACTION_CREATED: 'Transaction created successfully',
  TRANSACTION_UPDATED: 'Transaction updated successfully',
  TRANSACTION_DELETED: 'Transaction deleted successfully',
  FILE_PROCESSED: 'File processed successfully',
} as const;

// Enhanced OpenAI prompts with intelligent categorization for Russian-speaking users
export const OPENAI_PROMPTS = {
  RU: {
    /** The language the weekday in `SYSTEM_FINANCIAL_ASSISTANT` is written in. */
    LOCALE: 'ru-RU',

    /**
     * `today` is the day the phrase was said, on the user's calendar; `week` — the 7 days up to it with their weekdays,
     * so the model looks «в понедельник» up instead of counting (FT-175).
     */
    SYSTEM_FINANCIAL_ASSISTANT: (today: string, weekday: string, week: string) =>
      `Ты эксперт финансовый ассистент. Сегодня ${today}, ${weekday}. Последние 7 дней: ${week}.
      Основная валюта: узбекский сум (UZS).

      ВАЖНЫЕ ПРАВИЛА:
      - Всегда возвращай ответ в формате JSON с полем "items" (массив)
      - Анализируй контекст для точной категоризации
      - Определяй мерчантов/поставщиков по названиям и нормализуй их
      - Используй здравый смысл для категорий
      - Добавляй уверенность в анализе (confidence: 0.1-1.0)
      - Записывай суммы как есть, не конвертируй валюты
      - ВАЖНО: В поле category пиши название категории ровно так, как оно написано в списке ниже`,

    /** `categoryPrompt` lists the user's visible categories (FT-099, buildCategoryPrompt). */
    USER_ANALYZE_TRANSACTIONS: (categoryPrompt: string) =>
      `Проанализируй текст и извлеки все финансовые операции.

${categoryPrompt}

      ФОРМАТ ОТВЕТА (JSON):
      {
        "items": [
          { "intent": "transaction", "amount": число, "currency": "UZS" | "USD", "account": "cash" | "card" | null,
            "category": "название категории из списка", "type": "income" | "expense",
            "semanticType": "expense" | "income" | "own_transfer" | "saving_deposit" | "debt" | "reimbursement" | "cash_withdrawal" | "group_payment",
            "needsReview": true | false,
            "date": "YYYY-MM-DD", "merchant": "название", "confidence": число, "description": "описание" }
        ]
      }

      ДОЛГИ ОТДЕЛЬНО НЕ РАЗБИРАЙ:
      - "одолжил", "дал в долг", "взял в долг", "занял", "кредит", "рассрочка" → обычная операция
        (intent "transaction", type "expense") в категории "Другое"

      ПРАВИЛА ОПРЕДЕЛЕНИЯ SEMANTICTYPE (смысл транзакции, обязательное поле):
      - "expense" — обычная трата (покупки, еда, такси и т.д.)
      - "income" — обычный доход (зарплата, подарок)
      - "own_transfer" — перевод между своими счетами/картами
      - "saving_deposit" — перевод в накопления/сбережения
      - "debt" — возврат долга, который уже был записан
        Пример: "я вернул 50000" (я отдаю долг) → type "expense", semanticType "debt"
      - "reimbursement" — возврат денег, компенсация
        Пример: "мне вернули 100000" (деньги вернулись мне) → type "income", semanticType "reimbursement"
      - "cash_withdrawal" — снятие наличных
      - "group_payment" — оплата за компанию/группу с последующим разделением
      - Если не уверен — используй "expense" для расходов или "income" для доходов и поставь "needsReview": true

      ПРАВИЛА NEEDSREVIEW:
      - "needsReview": false — когда смысл операции понятен уверенно
      - "needsReview": true — когда операция неоднозначна, возможно это перевод себе/вклад/долг/наличные/групповой платёж, но из текста нельзя уверенно определить
      - Не придумывай semanticType "unknown": неопределённость отражается только через needsReview

      ПРАВИЛА ДАТ:
      - "вчера" = вчерашняя дата
      - "позавчера" = позавчерашняя дата
      - "в понедельник", "в субботу" = ближайший такой день недели не позже сегодняшнего
      - "25го", "25 числа" = 25-е число текущего/следующего месяца
      - "на прошлой неделе" = примерно 7 дней назад
      - Если дата не указана — сегодня

      ВАЛЮТА И СЧЁТ:
      - "$", "долл", "доллар", "usd" → "currency": "USD", сумма в долларах как написано (55, 9.99); иначе "UZS"
      - "нал", "наличными" → "account": "cash"; "картой", "по карте", "uzcard", "humo" → "account": "card"; иначе null

      НАЗВАНИЕ ЗАПИСИ:
      - "description" — что купили или за что получили, словами из текста, коротко
      - Без суммы, валюты и способа оплаты: «кофе 25к налом» → "description": "кофе",
        «подписка 9.99$» → "description": "подписка"

      ПРАВИЛА СУММ:
      - Записывай числа как есть (50000, 100, 25.5)
      - Ищи числа с любыми валютами (сум, сўм, UZS, $, €, руб)
      - НЕ КОНВЕРТИРУЙ валюты - записывай оригинальную сумму
      - Если сумма не указана четко, confidence = 0.3
      - Если трата или доход названы без суммы («такси» в «кофе 25к, такси»), верни их отдельным элементом
        с "amount": null — сумму не придумывай и не бери от соседней траты

      КРИТИЧНО: В поле "category" возвращай только название из списка категорий; если ни одна не подходит — "Другое".`,

    TRANSCRIPTION_PROMPT: 'финансовые транзакции, покупки, расходы, доходы, долги, одолжил, занял'
  },
  
  EN: {
    LOCALE: 'en-US',

    SYSTEM_FINANCIAL_ASSISTANT: (today: string, weekday: string, week: string) =>
      `You are an expert financial assistant. Today is ${today}, ${weekday}. The last 7 days: ${week}.
      Main currency: Uzbek Sum (UZS).

      IMPORTANT RULES:
      - Always return response in JSON array format
      - Analyze context for accurate categorization
      - Identify merchants/vendors and normalize them
      - Use common sense for categories
      - Add confidence in analysis (confidence: 0.1-1.0)
      - Record amounts as is, don't convert currencies
      - IMPORTANT: In the category field write a category name exactly as it appears in the list below`,

    /** `categoryPrompt` lists the user's visible categories (FT-099, buildCategoryPrompt). */
    USER_ANALYZE_TRANSACTIONS: (categoryPrompt: string) =>
      `Analyze the text and extract ALL financial transactions. IMPORTANT: Process multiple transactions in a single message!

      EXAMPLES OF MULTIPLE TRANSACTIONS:
      • "Spent $50 on food at McDonald's and $15 on taxi" → 2 transactions
      • "Gas station $100, bought bread $5, received salary $2000" → 3 transactions
      • "Yesterday: dinner $40, today: coffee $8" → 2 transactions with different dates

${categoryPrompt}

      CRITICAL: In the "category" field, return only a name from the category list; if none fits, "Другое".
      Debts, loans and installments are ordinary expenses in "Другое".

      RECORD NAME: "description" is what was bought or paid for, in the words of the text, short, without
      amount, currency or payment method: «кофе 25к налом» → "description": "кофе",
      «подписка 9.99$» → "description": "подписка"

      RESPONSE FORMAT:
      [{"amount": number, "category": "category name from the list", "type": "income" | "expense",
        "semanticType": "expense" | "income" | "own_transfer" | "saving_deposit" | "debt" | "reimbursement" | "cash_withdrawal" | "group_payment",
        "needsReview": true | false,
        "date": "YYYY-MM-DD", "merchant": "normalized name", "confidence": number, "description": "brief description"}]

      SEMANTIC TYPE RULES (required field, meaning of the transaction):
      - "expense" — a regular purchase/spend
      - "income" — regular income (salary, gift)
      - "own_transfer" — transfer between the user's own accounts/cards
      - "saving_deposit" — money moved into savings
      - "debt" — repaying a debt that was already recorded
      - "reimbursement" — money returned/refunded to the user
      - "cash_withdrawal" — cash withdrawal from ATM/bank
      - "group_payment" — paying for a group, to be split later
      - If unsure, use "expense" for spending or "income" for income and set "needsReview": true

      NEEDSREVIEW RULES:
      - "needsReview": false — when the meaning of the transaction is confidently clear
      - "needsReview": true — when the transaction is ambiguous (could be own_transfer/saving_deposit/debt/cash_withdrawal/group_payment) but the text doesn't clearly indicate which
      - Do NOT invent a semanticType "unknown": ambiguity is expressed only through needsReview

      DATE RULES:
      - "yesterday" = yesterday's date from today
      - "day before yesterday" = day before yesterday from today
      - "on Monday", "on Saturday" = the latest such weekday, today included
      - "last week" = approximately 7 days ago
      - If no date specified, use today

      AMOUNT RULES:
      - Record numbers as is (50000, 100, 25.5)
      - Look for numbers with any currencies (sum, сўм, UZS, $, €, rub)
      - DON'T CONVERT currencies - record original amount
      - If amount not clearly specified, confidence = 0.3
      - If a spend or an income is named without an amount ("taxi" in "coffee 25k, taxi"), return it as its own
        item with "amount": null — do not invent an amount or take a neighbour's`,

    TRANSCRIPTION_PROMPT: 'financial transactions, purchases, expenses, income'
  }
} as const;

export const HTTP_STATUS_MESSAGES = {
  400: 'Bad Request',
  401: 'Unauthorized', 
  403: 'Forbidden',
  404: 'Not Found',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
} as const;

// Default categories for different languages
export const DEFAULT_CATEGORIES = {
  RU: [
    'Еда',
    'Транспорт', 
    'Развлечения',
    'Покупки',
    'Здоровье',
    'Образование',
    'Жилье',
    'Зарплата',
    'Подарки',
    'Другое'
  ],
  
  EN: [
    'Food',
    'Transport',
    'Entertainment', 
    'Shopping',
    'Health',
    'Education',
    'Housing',
    'Salary',
    'Gifts',
    'Other'
  ]
} as const;