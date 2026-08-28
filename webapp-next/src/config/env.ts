export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api',
  isDevelopment: import.meta.env.DEV,
  /**
   * Обход авторизации для отладки в обычном браузере, вне Telegram.
   * Работает только когда бэкенд не в production — см. authMiddleware:138.
   * Заголовка X-Dev-User-Id нет в CORS allow-list, поэтому через прокси Vite он
   * проходит, а с чужого origin — нет.
   */
  devUserId: import.meta.env.VITE_DEV_USER_ID as string | undefined,
} as const;
