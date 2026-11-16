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
}

/**
 * The one rule for a link from the bot to the app (#278): an HTTPS address. Telegram opens a Mini App only there, and a
 * `web_app` button to any other makes it refuse the whole message, not the one button — `npm run dev` without a tunnel
 * runs with `WEB_APP_URL=http://localhost:3000`. The login's «Вернуться в браузер ↗» follows it too.
 */
export function isHttpsUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Whether the bot links to the Mini App at all: WEB_APP_URL is an HTTPS address. */
export function canLinkMiniApp(): boolean {
  try {
    return isHttpsUrl(AppConfig.getWebAppUrl());
  } catch {
    return false;
  }
}

/**
 * The address of a Mini App screen. It names no user: the Mini App knows who opened it from Telegram's initData — the
 * `?userId=<Telegram id>` every link carried was left from the old sign-in, and the webapp never read it (#281).
 * @throws when WEB_APP_URL is not an HTTPS address: Telegram would refuse the message with it (#278)
 */
export function createWebAppUrl(params: WebAppUrlParams = {}): string {
  const baseUrl = AppConfig.getWebAppUrl();

  if (!isHttpsUrl(baseUrl)) {
    throw new Error(baseUrl ? 'WEB_APP_URL is not an HTTPS address' : 'WEB_APP_URL not configured');
  }

  // A record to change: Home with its sheet open (the webapp's ROUTES.RECORD)
  if (params.edit) {
    const url = new URL('/', baseUrl);
    url.searchParams.set(RECORD_PARAM, params.edit);
    return url.toString();
  }

  return new URL(`/${params.path ?? ''}`, baseUrl).toString();
}

/** Home, or a screen of the Mini App; undefined without an HTTPS WEB_APP_URL. */
function appUrl(path?: WebAppPath): string | undefined {
  if (!canLinkMiniApp()) return undefined;
  try {
    return createWebAppUrl(path ? { path } : {});
  } catch {
    return undefined;
  }
}

/**
 * «Открыть Kapelka ↗» (Home) under /start and the daily summary, «Открыть аналитику ↗» under /month (FT-124); the audit
 * — its screen shows the goals after «Готово» — under the audit call and the goal reminders (FT-133).
 */
export const appLinks = {
  home: () => appUrl(),
  analytics: () => appUrl(WEB_APP_PATHS.analytics),
  audit: () => appUrl(WEB_APP_PATHS.audit),
};
