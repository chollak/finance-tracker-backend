import { AppConfig } from '../../../../shared/infrastructure/config/appConfig';

/**
 * The Mini App screens the bot opens, as paths without the leading slash. Each one must be a route of
 * the webapp (`webapp/src/shared/lib/constants/routes.ts`); `tests/telegramWebAppLinks.test.ts` checks
 * it, so a renamed screen cannot leave a bot button on «Страница не найдена».
 */
export const WEB_APP_PATHS = {
  /** History: «Остальные — в Kapelka ↗» under a message with many records (FT-122) */
  transactions: 'transactions',
  /** «Открыть аналитику ↗» under /month (FT-124) */
  analytics: 'analytics',
  /** «Открыть ревизию ↗» under the audit call and «Открыть цели ↗» under a goal reminder (FT-133) */
  audit: 'audit',
} as const;

export type WebAppPath = (typeof WEB_APP_PATHS)[keyof typeof WEB_APP_PATHS];

/**
 * The query parameter that names a record whose sheet Home opens (FT-115, the webapp's `RECORD_PARAM`):
 * the record has no page of its own since the edit page went.
 */
export const RECORD_PARAM = 'record';

export interface WebAppUrlParams {
  /** A record to change: Home opens its sheet. */
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

  // A record to change: Home with its sheet open (the webapp's ROUTES.RECORD)
  if (params.edit) {
    const url = new URL('/', baseUrl);
    url.searchParams.set(RECORD_PARAM, params.edit);
    url.searchParams.set('userId', userId);
    return url.toString();
  }

  // Regular path navigation
  const webPath = params.path || '';
  const url = new URL(`/${webPath}`, baseUrl);
  url.searchParams.set('userId', userId);

  return url.toString();
}

/** The Mini App for this user — Home, or a screen of it; undefined when the Mini App is not configured. */
function appUrl(telegramId: string, path?: WebAppPath): string | undefined {
  if (!isWebAppConfigured()) return undefined;
  try {
    return createWebAppUrl(telegramId, path ? { path } : {});
  } catch {
    return undefined;
  }
}

/**
 * «Открыть Kapelka ↗» (Home) under /start and the daily summary, «Открыть аналитику ↗» under /month (FT-124); the audit
 * — its screen shows the goals after «Готово» — under the audit call and the goal reminders (FT-133).
 */
export const appLinks = {
  home: (telegramId: string) => appUrl(telegramId),
  analytics: (telegramId: string) => appUrl(telegramId, WEB_APP_PATHS.analytics),
  audit: (telegramId: string) => appUrl(telegramId, WEB_APP_PATHS.audit),
};

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
