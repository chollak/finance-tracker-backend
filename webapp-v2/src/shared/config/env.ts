// Environment configuration wrapper
export const env = {
  // API Configuration
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api',

  // Development mode
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,

  // Mock user for development (when not in Telegram)
  mockUserId: import.meta.env.VITE_MOCK_USER_ID || '123456789',
  mockUserName: import.meta.env.VITE_MOCK_USER_NAME || 'Dev User',
} as const;
