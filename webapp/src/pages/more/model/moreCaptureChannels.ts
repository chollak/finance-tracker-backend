import { ROUTES } from '@/shared/lib/constants/routes';

/**
 * The capture channels «Ещё» lists (FT-082).
 *
 * More is where the product explains how an operation gets recorded at all, so this is the one
 * place that names every channel — including the two that are not built. The rule from FT-074
 * holds: a channel says what it can do *today*, never what the roadmap promises. Scanning is not
 * implemented anywhere, Mini App voice is not implemented, and neither gets an action that
 * pretends otherwise.
 *
 * The list is derived rather than hardcoded because availability genuinely depends on context:
 * text capture writes to the server and so is unavailable to a guest, and the Telegram row can
 * only offer to open a chat when a bot username was actually built into the app.
 */

export type CaptureChannelActionKind =
  /** Go Home and focus the quick-capture field. */
  | 'capture'
  /** Navigate to `href` inside the Mini App. */
  | 'route'
  /** Open the bot chat (deep link, or `openTelegramLink` inside Telegram). */
  | 'telegram'
  /** Explanation only — there is nothing to press that would do the thing. */
  | 'none';

export type CaptureChannelId = 'text' | 'voice' | 'shortcut' | 'manual' | 'scan';

export interface MoreCaptureChannel {
  id: CaptureChannelId;
  title: string;
  description: string;
  /** Short state word on the right: «Здесь», «В Telegram», «Скоро». */
  status: string;
  isAvailable: boolean;
  action: CaptureChannelActionKind;
  /** Set only when `action` is `'route'`. */
  href?: string;
}

export interface MoreCaptureChannelsInput {
  isGuest: boolean;
  /** `false` when no bot username was built in — then the Telegram row cannot offer a link. */
  hasBotLink: boolean;
}

/** Manual entry with the app's own keypad (FT-113). */
export const MANUAL_CAPTURE_HREF = ROUTES.MANUAL_ENTRY;

/**
 * Ordered by how a capture actually happens day to day: the two fast paths first, the phone
 * shortcut that leads back into them, the slow form as a fallback, and the unbuilt one last.
 */
export function getMoreCaptureChannels({
  isGuest,
  hasBotLink,
}: MoreCaptureChannelsInput): MoreCaptureChannel[] {
  return [
    isGuest
      ? {
          id: 'text',
          title: 'Текстом',
          description: 'Сохраняет на сервере — войдите через Telegram',
          status: 'Нужен вход',
          isAvailable: false,
          action: 'none',
        }
      : {
          id: 'text',
          title: 'Текстом',
          description: 'Одной строкой на главной',
          status: 'Здесь',
          isAvailable: true,
          action: 'capture',
        },
    {
      id: 'voice',
      title: 'Голосом боту',
      // Deliberately explicit about *where*: the Mini App has no recorder, and FT-074 already
      // had to say so on Home. Repeating it here keeps the two surfaces from disagreeing.
      description: 'Только в чате с ботом — здесь микрофона нет',
      status: 'В Telegram',
      isAvailable: true,
      action: hasBotLink ? 'telegram' : 'none',
    },
    {
      id: 'shortcut',
      title: 'Кнопка действия',
      description: 'Открывает чат с ботом, настраивается один раз',
      status: 'На iPhone',
      isAvailable: true,
      // Nothing here can set up a Shortcut — that happens in the iOS app, on the device.
      action: 'none',
    },
    {
      id: 'manual',
      title: 'Вручную',
      description: 'Сумма на своей клавиатуре, счёт, категория и дата',
      status: 'Здесь',
      isAvailable: true,
      action: 'route',
      href: MANUAL_CAPTURE_HREF,
    },
    {
      id: 'scan',
      title: 'Фото чека',
      description: 'Пока не сделано — ни здесь, ни в боте',
      status: 'Скоро',
      isAvailable: false,
      action: 'none',
    },
  ];
}
