interface TelegramUser {
  userId: string | null;
  userName: string | null;
}

/**
 * Extracts user data from Telegram WebApp
 * Returns null values if not in Telegram
 */
export function getTelegramUser(): TelegramUser {
  const telegram = window.Telegram?.WebApp;

  if (!telegram) {
    return { userId: null, userName: null };
  }

  const user = telegram.initDataUnsafe?.user;

  if (!user) {
    return { userId: null, userName: null };
  }

  return {
    userId: user.id.toString(),
    userName: user.first_name || null,
  };
}
