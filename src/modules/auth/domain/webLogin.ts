/**
 * Signing in to the web app through the bot (FT-128, decision Д4; boards «Вход по прямой ссылке», «Вход · ждём
 * подтверждения», «Бот · подтверждение входа», «Вход не подтвердили»). Kapelka lives in Telegram, so a browser has no
 * password: «Войти через Telegram» opens the chat with the bot by a one-time link, the user answers «Подтвердить» or
 * «Это не я» there, and the page that waits opens by itself. The link lives 5 minutes.
 *
 * A login is one row (`login_tokens`): the code of the link, the browser that waits for it, who opened it in Telegram
 * and the answer. A confirmed login becomes that browser's session.
 */

/** How long the link of a login lives, and the browser has to take a confirmed login: 5 minutes (design-system). */
export const LOGIN_LINK_TTL_MS = 5 * 60 * 1000;

/** How long a session in a browser lasts before the user signs in again; «Выйти» ends it earlier. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How long a login that is over stays in `login_tokens`: 7 days after its link ended and, if it became a session,
 * after that session's 30 days ran out («Выйти» does not shorten them here). A new login clears the older ones.
 */
export const LOGIN_ROW_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/** Logins that ended before this moment are cleared. */
export function loginRowsCutoff(now: Date): Date {
  return new Date(now.getTime() - LOGIN_ROW_KEEP_MS);
}

/** The start parameter of the bot link: `t.me/<bot>?start=login_<token>`. */
export const LOGIN_START_PREFIX = 'login_';

/**
 * - `pending` — the link is out, nobody answered yet;
 * - `confirmed` — «Подтвердить» in the bot; the browser has not taken the session yet;
 * - `rejected` — «Это не я»;
 * - `cancelled` — «Отменить вход» in the browser;
 * - `active` — the browser's session;
 * - `signed_out` — «Выйти».
 */
export type LoginStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'active' | 'signed_out';

export const LOGIN_STATUSES: readonly LoginStatus[] = ['pending', 'confirmed', 'rejected', 'cancelled', 'active', 'signed_out'];

export function isLoginStatus(value: string): value is LoginStatus {
  return (LOGIN_STATUSES as readonly string[]).includes(value);
}

export interface LoginToken {
  id: string;
  /** The one-time code of the link; not a credential — answering it takes a Telegram account. */
  token: string;
  /** Hash of the secret the waiting browser keeps in its cookie. */
  browserHash: string;
  /** Hash of the session cookie, once the browser took the confirmed login. */
  sessionHash: string | null;
  status: LoginStatus;
  /** «Chrome · Windows» — what the bot shows, so the user knows whose login it is. */
  device: string;
  /** Who opened the link in Telegram; only they can answer it. */
  telegramId: string | null;
  createdAt: Date;
  /** The end of the link: created + 5 minutes. */
  expiresAt: Date;
  confirmedAt: Date | null;
  sessionExpiresAt: Date | null;
}

/** What the waiting page is told: it shows the link, opens the app, or says the time is out. */
export type WebLoginState = 'none' | 'pending' | 'confirmed' | 'rejected' | 'expired';

/** The state of a login for the browser that waits for it, at `now`. */
export function webLoginState(login: LoginToken | null, now: Date): WebLoginState {
  if (!login) return 'none';
  switch (login.status) {
    case 'pending':
      return now.getTime() < login.expiresAt.getTime() ? 'pending' : 'expired';
    case 'confirmed':
      return canTakeSession(login, now) ? 'confirmed' : 'expired';
    case 'rejected':
      return 'rejected';
    default:
      // Cancelled, or already a session (or one that ended): there is no login to wait for
      return 'none';
  }
}

/** A confirmed login is taken by its browser within the same 5 minutes after «Подтвердить». */
export function canTakeSession(login: LoginToken, now: Date): boolean {
  if (login.status !== 'confirmed' || !login.confirmedAt) return false;
  return now.getTime() < login.confirmedAt.getTime() + LOGIN_LINK_TTL_MS;
}

/** A session lets its browser in until it ends or the user signs out. */
export function isLiveSession(login: LoginToken, now: Date): boolean {
  return login.status === 'active' && login.sessionExpiresAt !== null && now.getTime() < login.sessionExpiresAt.getTime();
}

/** How the bot's buttons answered a login. */
export type LoginAnswer = 'confirm' | 'reject';

/**
 * «Chrome · Windows» from the browser's User-Agent: the browser and the system, as the bot board shows them. Unknown
 * parts are left out; nothing known at all — «Браузер».
 */
export function deviceLabel(userAgent: string | undefined): string {
  const ua = userAgent ?? '';
  const browser = browserName(ua);
  const system = systemName(ua);
  if (browser && system) return `${browser} · ${system}`;
  return browser ?? system ?? 'Браузер';
}

function browserName(ua: string): string | null {
  // Order matters: Edge, Opera, Yandex and Samsung say «Chrome» too, Chrome says «Safari»
  if (/YaBrowser\//.test(ua)) return 'Яндекс Браузер';
  if (/Edg(e|A|iOS)?\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox';
  if (/Chrome\/|CriOS\/|Chromium\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari';
  return null;
}

function systemName(ua: string): string | null {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return null;
}
