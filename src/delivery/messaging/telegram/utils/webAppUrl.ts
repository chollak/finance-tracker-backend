import { AppConfig } from '../../../../shared/infrastructure/config/appConfig';

/**
 * The Mini App screens the bot opens, as paths without the leading slash. Each one must be a route of
 * the webapp (`webapp/src/shared/lib/constants/routes.ts`); `tests/telegramWebAppLinks.test.ts` checks
 * it, so a renamed screen cannot leave a bot button on «Страница не найдена».
 */
export const WEB_APP_PATHS = {
  /** Manual entry with the keypad (FT-113) */
  manualEntry: 'add',
  /** History */
  transactions: 'transactions',
  analytics: 'analytics',
  budgets: 'budgets',
} as const;

export type WebAppPath = (typeof WEB_APP_PATHS)[keyof typeof WEB_APP_PATHS];

export interface WebAppUrlParams {
  edit?: string;
  path?: WebAppPath;
  startapp?: string;
}

/**
 * Creates a URL for the Telegram Mini App
 * @param userId - Telegram user ID
 * @param params - Optional parameters for deep linking
 * @returns Full URL for Mini App
 */
export function createWebAppUrl(userId: string, params: WebAppUrlParams = {}): string {
  const baseUrl = AppConfig.getWebAppUrl();

  if (!baseUrl) {
    throw new Error('WEB_APP_URL not configured');
  }

  // For transaction editing - use the correct route path
  if (params.edit) {
    const url = new URL(`/transactions/${params.edit}/edit`, baseUrl);
    url.searchParams.set('userId', userId);
    return url.toString();
  }

  // Regular path navigation
  const webPath = params.path || '';
  const url = new URL(`/${webPath}`, baseUrl);
  url.searchParams.set('userId', userId);

  return url.toString();
}

/**
 * Creates a deep link URL for Telegram bot
 * Format: https://t.me/botname?startapp=command
 * @param botUsername - Bot username without @
 * @param startParam - Start parameter for deep linking
 */
export function createDeepLink(botUsername: string, startParam: string): string {
  return `https://t.me/${botUsername}?startapp=${encodeURIComponent(startParam)}`;
}

/**
 * Parse deep link start parameter
 * Format: action_id (e.g., edit_123, add, budgets)
 */
export function parseStartParam(startParam: string): { action: string; id?: string } {
  const [action, id] = startParam.split('_');
  return { action, id };
}

/**
 * Check if Web App URL is configured
 */
export function isWebAppConfigured(): boolean {
  try {
    const url = AppConfig.getWebAppUrl();
    return !!url;
  } catch {
    return false;
  }
}
