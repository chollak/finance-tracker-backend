// Environment configuration wrapper
export const env = {
  // API Configuration
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api',

  // Development mode
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,

  // Mock user for development outside Telegram: only when VITE_MOCK_USER_ID is set. Without it the dev server shows
  // the login screen, as a browser does (FT-128)
  mockUserId: (import.meta.env.DEV && import.meta.env.VITE_MOCK_USER_ID) || null,
  mockUserName: import.meta.env.VITE_MOCK_USER_NAME || 'Dev User',
} as const;
