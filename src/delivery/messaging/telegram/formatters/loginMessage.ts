import { InlineKeyboardButton } from 'telegraf/types';
import { Markup } from 'telegraf';
import { LoginAnswer } from '../../../../modules/auth/domain/webLogin';
import { BotLoginAnswer } from '../../../../modules/auth/application/webLogin';
import { localClock } from '../../../../modules/notification/domain/dailySummary';

/**
 * The bot's side of the web login (FT-128; boards «Бот · подтверждение входа», «Бот, вход из браузера, тёмная»):
 *
 *   Вход в Daftar из браузера                       ← bold
 *   Chrome · Windows, 14 октября в 19:42
 *
 *   Если это вы — подтвердите. Если нет — нажмите   ← italic
 *   «Это не я», и вход не состоится.
 *   [ Подтвердить ]
 *   [ Это не я ]
 *
 * The answer replaces the question: «Вход подтверждён» with «Вернуться в браузер ↗», «Вход отклонён».
 */

export interface LoginNotice {
  text: string;
  keyboard: InlineKeyboardButton[][];
}

const MONTHS_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** `login:ok:<id>` / `login:no:<id>` — 45 bytes of the 64 Telegram allows. */
export const LOGIN_CALLBACK_PATTERN = /^login:(ok|no):([0-9a-f-]{36})$/;

export function loginCallbackData(answer: LoginAnswer, loginId: string): string {
  return `login:${answer === 'confirm' ? 'ok' : 'no'}:${loginId}`;
}

export function loginAnswerOf(code: string): LoginAnswer {
  return code === 'ok' ? 'confirm' : 'reject';
}

/** «14 октября в 19:42» on the user's clock. */
function momentOn(at: Date, timeZone: string | undefined): string {
  const clock = localClock(at, timeZone);
  const [, month, day] = clock.date.split('-').map(Number);
  return `${day} ${MONTHS_OF[month - 1]} в ${clock.time}`;
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The question under /start login_<token>. */
export function formatLoginQuestion(login: { loginId: string; device: string; createdAt: Date }, timeZone: string | undefined): LoginNotice {
  return {
    text: [
      '<b>Вход в Daftar из браузера</b>',
      `${escapeHtml(login.device)}, ${momentOn(login.createdAt, timeZone)}`,
      '',
      '<i>Если это вы — подтвердите. Если нет — нажмите «Это не я», и вход не состоится.</i>',
    ].join('\n'),
    keyboard: [
      [Markup.button.callback('Подтвердить', loginCallbackData('confirm', login.loginId))],
      [Markup.button.callback('Это не я', loginCallbackData('reject', login.loginId))],
    ],
  };
}

/** A link that does not exist, was answered or cancelled, or was opened by another account. */
export function formatStaleLogin(): LoginNotice {
  return {
    text: '<b>Ссылка для входа устарела</b>\nВернитесь в браузер и нажмите «Войти через Telegram» ещё раз.',
    keyboard: [],
  };
}

/**
 * What the question becomes after a press. «Вернуться в браузер ↗» opens the web app — only an HTTPS address: Telegram
 * refuses a button to http://localhost.
 */
export function formatLoginAnswer(answer: BotLoginAnswer, options: { webUrl?: string }): LoginNotice {
  switch (answer.kind) {
    case 'confirmed':
      return {
        text: `<b>Вход подтверждён</b>\n${escapeHtml(answer.device)}. Вернитесь в браузер — Daftar уже открыт.`,
        keyboard: options.webUrl?.startsWith('https://') ? [[Markup.button.url('Вернуться в браузер ↗', options.webUrl)]] : [],
      };
    case 'rejected':
      return {
        text: '<b>Вход отклонён</b>\nНикто не получил доступ к вашим записям. Если входили не вы — ничего делать не нужно.',
        keyboard: [],
      };
    case 'expired':
      return {
        text: '<b>Вход не подтвердили</b>\nСсылка для входа действует 5 минут, и это время вышло. Вернитесь в браузер и нажмите «Войти через Telegram» ещё раз.',
        keyboard: [],
      };
    default:
      return formatStaleLogin();
  }
}
