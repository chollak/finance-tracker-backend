import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { backStep, syncTelegramBackButton, telegramBackButton, type TelegramBackButtonApi } from './backNavigation';

/** Telegram's BackButton for this page, or null outside Telegram (and when rendered without a window). */
export function currentTelegramBackButton(): TelegramBackButtonApi | null {
  if (typeof window === 'undefined') return null;
  return telegramBackButton(window.Telegram?.WebApp);
}

/** One press of «Назад» on the current screen: the previous app screen, or the parent one. */
export function useGoBack(): () => void {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return useCallback(() => {
    const historyIndex = (window.history.state as { idx?: number } | null)?.idx;
    const step = backStep(pathname, historyIndex);
    if (!step) return;
    if (step.kind === 'history') navigate(-1);
    else navigate(step.to, { replace: true });
  }, [navigate, pathname]);
}

/**
 * Keeps Telegram's BackButton in step with the screen: shown on nested screens, hidden on Home.
 * Mounted once, in the app shell; outside Telegram it does nothing and screens draw their own «Назад».
 */
export function useTelegramBackButton(): void {
  const { pathname } = useLocation();
  const goBack = useGoBack();

  useEffect(() => {
    const button = currentTelegramBackButton();
    if (!button) return;
    return syncTelegramBackButton(button, pathname, goBack);
  }, [pathname, goBack]);

  // When the shell goes away (the first launch takes the screen), the button goes with it
  useEffect(() => () => currentTelegramBackButton()?.hide(), []);
}
