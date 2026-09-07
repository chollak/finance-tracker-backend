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

  /**
   * Bot username for `t.me` deep links, without `@`.
   *
   * Deliberately falls back to an empty string rather than to a guessed name: a link built on
   * the wrong username opens someone else's bot or nothing at all, and «Ещё» would then be
   * offering a capture channel that does not exist. Callers must treat `''` as "cannot link".
   */
  telegramBotUsername: import.meta.env.VITE_TG_BOT_USERNAME || '',
} as const;
