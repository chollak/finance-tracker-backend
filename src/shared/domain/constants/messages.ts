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
  NOTION_ERROR: 'Notion service unavailable',
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
      - Всегда возвращай ответ в формате JSON массива
      - Анализируй контекст для точной категоризации
      - Определяй мерчантов/поставщиков по названиям и нормализуй их
      - Используй здравый смысл для категорий
      - Добавляй уверенность в анализе (confidence: 0.1-1.0)
      - Записывай суммы как есть, не конвертируй валюты`,
    
    USER_ANALYZE_TRANSACTIONS: 
      `Проанализируй текст и извлеки все финансовые транзакции. ВАЖНО: Обрабатывай множественные транзакции в одном сообщении!
      
      ПРИМЕРЫ МНОЖЕСТВЕННЫХ ТРАНЗАКЦИЙ:
      • "Потратил 50000 на еду в KFC и 15000 на такси" → 2 транзакции
      • "Заправился за 100000, купил хлеб за 5000, получил зарплату 2000000" → 3 транзакции
      • "Вчера: ужин 40000, сегодня: кофе 8000" → 2 транзакции с разными датами
      
      КАТЕГОРИИ И ПАТТЕРНЫ:
      • Еда: рестораны, кафе, доставка, продукты (Evos, MaxWay, KFC, McDonald's, продуктовые магазины, базары)
      • Транспорт: такси, топливо, парковка, общественный транспорт (Yandex Go, Яндекс Такси, АЗС, метро, автобус)
      • Развлечения: кино, игры, спорт, хобби (кинотеатр, игровые центры, спортзал)
      • Покупки: одежда, электроника, товары (торговые центры, онлайн магазины, рынки)
      • Здоровье: лекарства, врачи, анализы (аптека, поликлиника, стоматолог, больница)
      • Жилье: коммунальные, аренда, ремонт (электричество, газ, вода, аренда)
      • Образование: курсы, книги, подписки (университет, курсы, обучение)
      • Зарплата: доходы от работы, фриланс, инвестиции
      • Подарки: подарки другим, благотворительность
      • Другое: все остальные транзакции
      
      ФОРМАТ ОТВЕТА:
      [{"amount": число, "category": строка, "type": "income" | "expense", "date": "YYYY-MM-DD", 
        "merchant": "нормализованное название", "confidence": число, "description": "краткое описание"}]
      
      ПРАВИЛА ДАТ:
      - "вчера" = вчерашняя дата от сегодняшнего дня
      - "позавчера" = позавчерашняя дата от сегодняшнего дня
      - "на прошлой неделе" = примерно 7 дней назад
      - Если дата не указана, используй сегодня
      
      ПРАВИЛА СУММ:
      - Записывай числа как есть (50000, 100, 25.5)
      - Ищи числа с любыми валютами (сум, сўм, UZS, $, €, руб)
      - НЕ КОНВЕРТИРУЙ валюты - записывай оригинальную сумму
      - Если сумма не указана четко, confidence = 0.3`,
      
    TRANSCRIPTION_PROMPT: 'финансовые транзакции, покупки, расходы, доходы'
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
      - Record amounts as is, don't convert currencies`,
    
    USER_ANALYZE_TRANSACTIONS: 
      `Analyze the text and extract ALL financial transactions. IMPORTANT: Process multiple transactions in a single message!
      
      EXAMPLES OF MULTIPLE TRANSACTIONS:
      • "Spent $50 on food at McDonald's and $15 on taxi" → 2 transactions
      • "Gas station $100, bought bread $5, received salary $2000" → 3 transactions  
      • "Yesterday: dinner $40, today: coffee $8" → 2 transactions with different dates
      
      Use intelligent categorization:
      
      CATEGORIES & PATTERNS:
      • Food: restaurants, cafes, delivery, groceries (Evos, MaxWay, KFC, McDonald's, stores, markets)
      • Transport: taxi, fuel, parking, public transport (Yandex Go, gas stations, metro, bus)
      • Entertainment: movies, games, sports, hobbies (cinema, gaming centers, gym)
      • Shopping: clothing, electronics, goods (malls, online stores, markets)
      • Health: medicine, doctors, tests (pharmacy, clinic, dentist, hospital)
      • Housing: utilities, rent, repairs (electricity, gas, water, rent)
      • Education: courses, books, subscriptions (university, courses, training)
      • Salary: work income, freelance, investments
      • Gifts: gifts to others, charity
      • Other: all other transactions
      
      RESPONSE FORMAT:
      [{"amount": number, "category": string, "type": "income" | "expense", "date": "YYYY-MM-DD",
        "merchant": "normalized name", "confidence": number, "description": "brief description"}]
      
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