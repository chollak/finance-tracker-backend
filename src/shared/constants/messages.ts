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

// OpenAI prompts in different languages
export const OPENAI_PROMPTS = {
  RU: {
    SYSTEM_FINANCIAL_ASSISTANT: (today: string) => 
      `Ты финансовый ассистент. Сегодня ${today}. Всегда возвращай ответ в формате JSON массива.`,
    
    USER_ANALYZE_TRANSACTIONS: 
      'Проанализируй текст и извлеки каждую отдельную транзакцию. ' +
      'Верни JSON массив объектов формата [{"amount": число, "category": строка, ' +
      '"type": "income" | "expense", "date": "YYYY-MM-DD"}]. ' +
      'Если встречаются слова вроде "вчера" или "позавчера", вычисли фактическую дату относительно сегодняшнего дня. ' +
      'Даже если найдена только одна транзакция, верни массив с одним элементом.',
      
    TRANSCRIPTION_PROMPT: 'финансовые транзакции'
  },
  
  EN: {
    SYSTEM_FINANCIAL_ASSISTANT: (today: string) => 
      `You are a financial assistant. Today is ${today}. Always return response in JSON array format.`,
    
    USER_ANALYZE_TRANSACTIONS: 
      'Analyze the text and extract each individual transaction. ' +
      'Return a JSON array of objects in format [{"amount": number, "category": string, ' +
      '"type": "income" | "expense", "date": "YYYY-MM-DD"}]. ' +
      'If you encounter words like "yesterday" or "day before yesterday", calculate the actual date relative to today. ' +
      'Even if only one transaction is found, return an array with one element.',
      
    TRANSCRIPTION_PROMPT: 'financial transactions'
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