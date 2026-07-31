/**
 * Application messages and prompts
 * Centralized for easy translation and maintenance
 */

import { generateCategoryPrompt, generateDebtPrompt } from '../entities/Category';

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
    SYSTEM_FINANCIAL_ASSISTANT: (today: string) =>
      `Ты эксперт финансовый ассистент. Сегодня ${today}. Основная валюта: узбекский сум (UZS).

      ВАЖНЫЕ ПРАВИЛА:
      - Всегда возвращай ответ в формате JSON с полем "items" (массив)
      - Различай ДОЛГИ и ТРАНЗАКЦИИ по контексту
      - Анализируй контекст для точной категоризации
      - Определяй мерчантов/поставщиков по названиям и нормализуй их
      - Используй здравый смысл для категорий
      - Добавляй уверенность в анализе (confidence: 0.1-1.0)
      - Записывай суммы как есть, не конвертируй валюты
      - ВАЖНО: В поле category используй ТОЛЬКО английские ID категорий из списка ниже`,

    USER_ANALYZE_TRANSACTIONS:
      `Проанализируй текст и извлеки все финансовые операции. ВАЖНО: Различай ДОЛГИ и ТРАНЗАКЦИИ!

${generateDebtPrompt()}

${generateCategoryPrompt()}

      ФОРМАТ ОТВЕТА (JSON):
      {
        "items": [
          // Для ДОЛГА:
          { "intent": "debt", "debtType": "i_owe" | "owed_to_me", "personName": "имя", "amount": число,
            "dueDate": "YYYY-MM-DD" | null, "description": "описание", "moneyTransferred": true/false, "confidence": число },
          // Для ТРАНЗАКЦИИ:
          { "intent": "transaction", "amount": число, "category": "category_id", "type": "income" | "expense",
            "semanticType": "expense" | "income" | "own_transfer" | "saving_deposit" | "debt" | "reimbursement" | "cash_withdrawal" | "group_payment",
            "needsReview": true | false,
            "date": "YYYY-MM-DD", "merchant": "название", "confidence": число, "description": "описание" }
        ]
      }

      ПРАВИЛА ОПРЕДЕЛЕНИЯ INTENT:
      - "одолжил", "дал в долг", "взял в долг", "занял у", "должен" → intent: "debt"
      - Остальное (покупки, оплаты, зарплата) → intent: "transaction"

      ПРАВИЛА ОПРЕДЕЛЕНИЯ SEMANTICTYPE (смысл транзакции, обязательное поле):
      - "expense" — обычная трата (покупки, еда, такси и т.д.)
      - "income" — обычный доход (зарплата, подарок)
      - "own_transfer" — перевод между своими счетами/картами
      - "saving_deposit" — перевод в накопления/сбережения
      - "debt" — движение денег, связанное с долгом (сама транзакция, а не intent "debt")
      - "reimbursement" — возврат денег, компенсация
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
      - "25го", "25 числа" = 25-е число текущего/следующего месяца
      - "на прошлой неделе" = примерно 7 дней назад
      - Если дата не указана: для транзакций = сегодня, для долгов dueDate = null

      ПРАВИЛА СУММ:
      - Записывай числа как есть (50000, 100, 25.5)
      - Ищи числа с любыми валютами (сум, сўм, UZS, $, €, руб)
      - НЕ КОНВЕРТИРУЙ валюты - записывай оригинальную сумму
      - Если сумма не указана четко, confidence = 0.3

      КРИТИЧНО: В поле "category" возвращай ТОЛЬКО английский ID (food, taxi, utilities, salary и т.д.)!`,

    TRANSCRIPTION_PROMPT: 'финансовые транзакции, покупки, расходы, доходы, долги, одолжил, занял'
  },
  
  EN: {
    SYSTEM_FINANCIAL_ASSISTANT: (today: string) =>
      `You are an expert financial assistant. Today is ${today}. Main currency: Uzbek Sum (UZS).

      IMPORTANT RULES:
      - Always return response in JSON array format
      - Analyze context for accurate categorization
      - Identify merchants/vendors and normalize them
      - Use common sense for categories
      - Add confidence in analysis (confidence: 0.1-1.0)
      - Record amounts as is, don't convert currencies
      - IMPORTANT: Use ONLY English category IDs from the list below in the category field`,

    USER_ANALYZE_TRANSACTIONS:
      `Analyze the text and extract ALL financial transactions. IMPORTANT: Process multiple transactions in a single message!

      EXAMPLES OF MULTIPLE TRANSACTIONS:
      • "Spent $50 on food at McDonald's and $15 on taxi" → 2 transactions
      • "Gas station $100, bought bread $5, received salary $2000" → 3 transactions
      • "Yesterday: dinner $40, today: coffee $8" → 2 transactions with different dates

${generateCategoryPrompt()}

      CRITICAL: In the "category" field, return ONLY English IDs (food, taxi, utilities, salary, etc.), NOT Russian names!

      RESPONSE FORMAT:
      [{"amount": number, "category": "category_id", "type": "income" | "expense",
        "semanticType": "expense" | "income" | "own_transfer" | "saving_deposit" | "debt" | "reimbursement" | "cash_withdrawal" | "group_payment",
        "needsReview": true | false,
        "date": "YYYY-MM-DD", "merchant": "normalized name", "confidence": number, "description": "brief description"}]

      SEMANTIC TYPE RULES (required field, meaning of the transaction):
      - "expense" — a regular purchase/spend
      - "income" — regular income (salary, gift)
      - "own_transfer" — transfer between the user's own accounts/cards
      - "saving_deposit" — money moved into savings
      - "debt" — a money movement tied to debt (the transaction itself, not intent "debt")
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
      - "last week" = approximately 7 days ago
      - If no date specified, use today

      AMOUNT RULES:
      - Record numbers as is (50000, 100, 25.5)
      - Look for numbers with any currencies (sum, сўм, UZS, $, €, rub)
      - DON'T CONVERT currencies - record original amount
      - If amount not clearly specified, confidence = 0.3`,

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