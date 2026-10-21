/**
 * The web login (FT-128, decision Д4; boards «Вход по прямой ссылке», «Вход · ждём подтверждения», «Вход не
 * подтвердили»): what the page shows for each answer the server gives about its login.
 */

export interface PendingLogin {
  status: 'pending';
  /** `https://t.me/<bot>?start=login_<token>` */
  link: string;
  /** ISO moment: 5 minutes after the link was made. */
  expiresAt: string;
}

export type WebLoginStatus = PendingLogin | { status: 'none' | 'confirmed' | 'rejected' | 'expired' };

export type LoginView =
  /** Asking the server whether a login is already under way (a reload while waiting). */
  | { kind: 'checking' }
  | { kind: 'start' }
  | { kind: 'waiting'; link: string; expiresAt: string }
  | { kind: 'expired' }
  /** «Подтвердить» was pressed: the session is being taken. */
  | { kind: 'signing-in' };

export interface LoginNotice {
  title: string;
  detail: string;
}

/** How often the waiting page asks how its login went. */
export const LOGIN_POLL_MS = 3000;

/** How long a link lives (the server's rule, `LOGIN_LINK_TTL_MS`). */
const LINK_MINUTES = 5;

export const LOGIN_NOTICES = {
  rejected: { title: 'Вход отклонён', detail: 'В Telegram нажали «Это не я»' },
  unavailable: { title: 'Вход через Telegram недоступен', detail: 'Попробуйте через несколько минут' },
  tooMany: { title: 'Слишком много попыток', detail: 'Попробуйте через 15 минут' },
  failed: { title: 'Не получилось начать вход', detail: 'Проверьте связь и попробуйте ещё раз' },
  signOutFailed: { title: 'Не получилось выйти', detail: 'Проверьте связь и попробуйте ещё раз' },
} satisfies Record<string, LoginNotice>;

/** The screen after an answer about the login, and what to say when it went back to the start. */
export function loginViewAfter(status: WebLoginStatus): { view: LoginView; notice?: LoginNotice } {
  switch (status.status) {
    case 'pending':
      return { view: { kind: 'waiting', link: status.link, expiresAt: status.expiresAt } };
    case 'confirmed':
      return { view: { kind: 'signing-in' } };
    case 'expired':
      return { view: { kind: 'expired' } };
    case 'rejected':
      return { view: { kind: 'start' }, notice: LOGIN_NOTICES.rejected };
    default:
      return { view: { kind: 'start' } };
  }
}

/** Why a login could not start, by the server's answer. */
export function startFailedNotice(error: unknown): LoginNotice {
  const status = typeof error === 'object' && error !== null ? (error as { statusCode?: unknown }).statusCode : undefined;
  if (status === 503) return LOGIN_NOTICES.unavailable;
  if (status === 429) return LOGIN_NOTICES.tooMany;
  return LOGIN_NOTICES.failed;
}

/** «5 минут, до 19:47»: the end of the link on this device's clock. */
export function expiryLine(expiresAt: string, timeZone?: string): string {
  const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(expiresAt));
  return `${LINK_MINUTES} минут, до ${time}`;
}
