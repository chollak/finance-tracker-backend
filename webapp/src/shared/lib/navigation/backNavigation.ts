import { ROUTES } from '@/shared/lib/constants/routes';

/**
 * «Назад» of «Пастель» (FT-110). There is no bottom bar: Home is the top of the app, History and
 * Analytics open from it, the other sections from «Ещё». Every other screen is nested and has a back:
 * Telegram's BackButton inside Telegram, the screen's own round «Назад» elsewhere (design-system,
 * «Telegram»).
 */

/** The part of Telegram's BackButton the app uses. */
export interface TelegramBackButtonApi {
  show(): void;
  hide(): void;
  onClick(callback: () => void): void;
  offClick(callback: () => void): void;
}

/** The part of `Telegram.WebApp` needed to decide whether its BackButton can be used. */
export interface TelegramBackButtonHost {
  initData: string;
  isVersionAtLeast?: (version: string) => boolean;
  BackButton?: TelegramBackButtonApi;
}

/** Sections opened from «Ещё» rather than from Home. */
const OPENED_FROM_MORE: readonly string[] = [ROUTES.BUDGETS, ROUTES.DEBTS];

/**
 * The screen «Назад» leads to when there is no app screen to return to — the screen was opened by a
 * link from the bot or reloaded. `null` on Home.
 */
export function parentPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const section = `/${segments[0]}`;
  // Manual entry (/add) is a way to write, opened from Home or «Ещё»: one segment, so its parent is Home
  if (segments.length === 1) return OPENED_FROM_MORE.includes(section) ? ROUTES.MORE : ROUTES.HOME;
  return section;
}

export type BackStep = { kind: 'history' } | { kind: 'route'; to: string };

/**
 * What one press of «Назад» does. `historyIndex` is react-router's index of the current entry
 * (`history.state.idx`): above 0, an app screen opened this one and the press returns to it; at 0 the
 * press would leave the app, so it opens the parent screen instead.
 */
export function backStep(pathname: string, historyIndex: number | undefined): BackStep | null {
  const parent = parentPath(pathname);
  if (parent === null) return null;
  if (typeof historyIndex === 'number' && historyIndex > 0) return { kind: 'history' };
  return { kind: 'route', to: parent };
}

/**
 * How a form or a detail screen closes after a save or a delete: the way «Назад» does — back to the app
 * screen that opened it, or, when it was opened directly, to its parent in its own place. It never
 * pushes the list on top of the form, so the next «Назад» cannot land on the submitted form or on a
 * record that was just deleted.
 */
export function closeStep(pathname: string, historyIndex: number | undefined): BackStep {
  return backStep(pathname, historyIndex) ?? { kind: 'route', to: ROUTES.HOME };
}

/**
 * Where a saved record leaves its screen (FT-113: «после — главная»): Home. When Home opened the screen,
 * one step back to it, so Home is not stacked twice; otherwise Home takes the screen's place, so «Назад»
 * never reopens the submitted form. `openedFrom` is the path the link to the screen passed along.
 */
export function homeAfterSaveStep(historyIndex: number | undefined, openedFrom: string | undefined): BackStep {
  if (openedFrom === ROUTES.HOME && typeof historyIndex === 'number' && historyIndex > 0) return { kind: 'history' };
  return { kind: 'route', to: ROUTES.HOME };
}

/**
 * Telegram's BackButton, when the page really runs inside Telegram and the client has one (Bot API 6.1).
 * The SDK is loaded in a plain browser too, with empty initData, so only initData tells them apart.
 */
export function telegramBackButton(webApp: TelegramBackButtonHost | undefined): TelegramBackButtonApi | null {
  if (!webApp?.initData || !webApp.BackButton) return null;
  if (webApp.isVersionAtLeast && !webApp.isVersionAtLeast('6.1')) return null;
  return webApp.BackButton;
}

/** Which «Назад» a screen gets. */
export function backControl(pathname: string, hasTelegramBackButton: boolean): 'telegram' | 'own' | 'none' {
  if (parentPath(pathname) === null) return 'none';
  return hasTelegramBackButton ? 'telegram' : 'own';
}

/**
 * Puts Telegram's BackButton in the state the screen at `pathname` needs: shown and wired to `goBack`
 * on a nested screen, hidden on Home. Returns the cleanup that unwires the press, so moving between
 * screens never leaves two handlers (one press, two steps back). Visibility is not reset in the
 * cleanup: between two nested screens the button stays put instead of blinking.
 */
export function syncTelegramBackButton(
  button: TelegramBackButtonApi,
  pathname: string,
  goBack: () => void
): () => void {
  if (backControl(pathname, true) !== 'telegram') {
    button.hide();
    return () => {};
  }
  button.onClick(goBack);
  button.show();
  return () => button.offClick(goBack);
}

/**
 * The app shell's effect for one screen: inside Telegram, Telegram's BackButton is put in step with the
 * screen (see `syncTelegramBackButton`); outside Telegram nothing happens, the screen draws its own «Назад».
 */
export function keepTelegramBackButtonInStep(
  webApp: TelegramBackButtonHost | undefined,
  pathname: string,
  goBack: () => void
): () => void {
  const button = telegramBackButton(webApp);
  if (!button) return () => {};
  return syncTelegramBackButton(button, pathname, goBack);
}
