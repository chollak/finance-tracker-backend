import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  backStep,
  closeStep,
  homeAfterSaveStep,
  keepTelegramBackButtonInStep,
  telegramBackButton,
  type BackStep,
  type TelegramBackButtonApi,
} from './backNavigation';

/** Telegram's BackButton for this page, or null outside Telegram (and when rendered without a window). */
export function currentTelegramBackButton(): TelegramBackButtonApi | null {
  if (typeof window === 'undefined') return null;
  return telegramBackButton(window.Telegram?.WebApp);
}

/** react-router's index of the current history entry (`history.state.idx`); undefined without a window. */
function currentHistoryIndex(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window.history.state as { idx?: number } | null)?.idx;
}

/** The parents screens named for themselves (`useScreenParent`), by pathname. */
const screenParents = new Map<string, string>();

/**
 * Where «Назад» of this screen leads when it was opened directly (a link, a reload): `path` instead of the parent its
 * address gives — a category of analytics returns to its own month and side, not to this month's expenses. Both the
 * screen's own «Назад» and Telegram's BackButton follow it; `null` keeps the parent of the address.
 */
export function useScreenParent(path: string | null): void {
  const { pathname } = useLocation();
  useEffect(() => {
    if (path === null) return;
    screenParents.set(pathname, path);
    return () => {
      if (screenParents.get(pathname) === path) screenParents.delete(pathname);
    };
  }, [pathname, path]);
}

/** Runs the step `choose` picks for the current screen: one entry back, or the target in place of this one. */
function useStep(choose: (pathname: string, historyIndex: number | undefined, screenParent?: string) => BackStep | null): () => void {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return useCallback(() => {
    const step = choose(pathname, currentHistoryIndex(), screenParents.get(pathname));
    if (!step) return;
    if (step.kind === 'history') navigate(-1);
    else navigate(step.to, { replace: true });
  }, [choose, navigate, pathname]);
}

/** One press of «Назад» on the current screen: the previous app screen, or the parent one. */
export function useGoBack(): () => void {
  return useStep(backStep);
}

/**
 * Closes a form or a detail screen after a save or a delete, the way «Назад» does (see `closeStep`).
 * Forms use it instead of `navigate(list)`, which would leave the submitted form under the list.
 */
export function useCloseScreen(): () => void {
  return useStep(closeStep);
}

/** What a link to a screen passes along so the screen knows who opened it (see `useShowHomeAfterSave`). */
export interface OpenedFromState {
  from: string;
}

/**
 * Shows Home after a record is saved (FT-113), see `homeAfterSaveStep`. The screen learns who opened it
 * from the link's state (`{ from }`); a screen opened directly has none.
 */
export function useShowHomeAfterSave(): () => void {
  const navigate = useNavigate();
  const { state } = useLocation();
  const openedFrom = (state as Partial<OpenedFromState> | null)?.from;

  return useCallback(() => {
    const step = homeAfterSaveStep(currentHistoryIndex(), openedFrom);
    if (step.kind === 'history') navigate(-1);
    else navigate(step.to, { replace: true });
  }, [navigate, openedFrom]);
}

/**
 * Keeps Telegram's BackButton in step with the screen: shown on nested screens, hidden on Home.
 * Mounted once, in the app shell; outside Telegram it does nothing and screens draw their own «Назад».
 */
export function useTelegramBackButton(): void {
  const { pathname } = useLocation();
  const goBack = useGoBack();

  useEffect(() => keepTelegramBackButtonInStep(window.Telegram?.WebApp, pathname, goBack), [pathname, goBack]);

  // When the shell goes away (the first launch takes the screen), the button goes with it
  useEffect(() => () => currentTelegramBackButton()?.hide(), []);
}
