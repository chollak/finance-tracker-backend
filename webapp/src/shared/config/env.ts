// Environment configuration wrapper
export const env = {
  // The API is always on the page's own origin: the server serves both, and the dev server proxies /api (#341)
  apiBaseUrl: '/api',

  // Development mode
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,

  // Mock user for development outside Telegram: only when VITE_MOCK_USER_ID is set. Without it the dev server shows
  // the login screen, as a browser does (FT-128)
  mockUserId: (import.meta.env.DEV && import.meta.env.VITE_MOCK_USER_ID) || null,
  mockUserName: import.meta.env.VITE_MOCK_USER_NAME || 'Dev User',
} as const;
