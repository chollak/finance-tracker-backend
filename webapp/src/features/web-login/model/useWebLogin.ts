import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionUser } from '@/entities/user';
import { showUndoToast } from '@/shared/lib/undo';
import { cancelWebLogin, openWebSession, readWebLogin, startWebLogin } from '../api/webLoginApi';
import { LOGIN_POLL_MS, loginViewAfter, startFailedNotice, type LoginNotice, type LoginView, type PendingLogin, type WebLoginStatus } from './webLogin';

function notify(notice: LoginNotice): void {
  showUndoToast({ kind: 'info', title: notice.title, detail: notice.detail });
}

/**
 * A new tab for the chat with the bot, opened in the press itself — a tab opened after the server's answer would be
 * blocked as a popup. It gets the bot link once the server gives it; the bot's page cannot reach back into this one.
 * Null when the browser blocked it anyway: the waiting screen has «Открыть Telegram».
 */
function openBlankTab(): Window | null {
  try {
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    return tab;
  } catch {
    return null;
  }
}

export interface WebLogin {
  view: LoginView;
  /** The login under way: its link and when it ends — also while the session is being taken. */
  login: PendingLogin | null;
  /** The server is asked for a link. */
  busy: boolean;
  /** «Войти через Telegram» — on the start and after the time ran out. */
  start: () => void;
  /** «Отменить вход». */
  cancel: () => void;
}

/**
 * The web login (FT-128): «Войти через Telegram» asks the server for a one-time link and opens the chat with the bot;
 * while the page waits it asks how its login went every few seconds and at once when the user comes back to the tab.
 * «Подтвердить» in the bot — the confirmed login becomes this browser's session and `onSignedIn` gets its user; the 5
 * minutes are over — «Вход не подтвердили»; «Это не я» — the start again, saying why. A reload while waiting goes on
 * waiting for the same login.
 */
export function useWebLogin(onSignedIn: (user: SessionUser) => void): WebLogin {
  const [view, setView] = useState<LoginView>({ kind: 'checking' });
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState<PendingLogin | null>(null);
  const alive = useRef(true);
  const signedIn = useRef(onSignedIn);
  signedIn.current = onSignedIn;
  // The waiting screen to go back to when taking the session did not reach the server
  const waiting = useRef<LoginView | null>(null);

  const apply = useCallback(async (status: WebLoginStatus) => {
    const next = loginViewAfter(status);
    if (status.status === 'pending') {
      waiting.current = next.view;
      setLogin(status);
    }
    setView(next.view);
    if (next.notice) notify(next.notice);
    if (next.view.kind !== 'signing-in') return;
    try {
      const user = await openWebSession();
      if (alive.current) signedIn.current(user);
    } catch (error) {
      if (!alive.current) return;
      // 409: the 5 minutes to take it ran out; anything else (no network): wait and ask again
      const gone = (error as { statusCode?: number }).statusCode === 409;
      setView(gone || !waiting.current ? { kind: 'expired' } : waiting.current);
    }
  }, []);

  // A login may already be under way: a reload while waiting
  useEffect(() => {
    alive.current = true;
    readWebLogin()
      .then((status) => {
        if (alive.current) void apply(status);
      })
      .catch(() => {
        if (alive.current) setView({ kind: 'start' });
      });
    return () => {
      alive.current = false;
    };
  }, [apply]);

  // While waiting: ask every few seconds, and at once when the user comes back from Telegram
  const waitingFor = view.kind === 'waiting' ? view.link : null;
  useEffect(() => {
    if (!waitingFor) return;
    let stopped = false;
    let asking = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void check(), LOGIN_POLL_MS);
    };
    const check = async () => {
      if (stopped || asking) return;
      asking = true;
      clearTimeout(timer);
      try {
        const status = await readWebLogin();
        if (stopped) return;
        if (status.status === 'pending') schedule();
        else await apply(status);
      } catch {
        if (!stopped) schedule();
      } finally {
        asking = false;
      }
    };
    const onBack = () => {
      if (document.visibilityState !== 'hidden') void check();
    };
    schedule();
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener('focus', onBack);
      document.removeEventListener('visibilitychange', onBack);
    };
  }, [waitingFor, apply]);

  const start = useCallback(() => {
    if (busy) return;
    setBusy(true);
    const tab = openBlankTab();
    startWebLogin()
      .then((login) => {
        if (tab) tab.location.href = login.link;
        if (alive.current) void apply(login);
      })
      .catch((error) => {
        tab?.close();
        notify(startFailedNotice(error));
      })
      .finally(() => {
        if (alive.current) setBusy(false);
      });
  }, [busy, apply]);

  const cancel = useCallback(() => {
    waiting.current = null;
    setLogin(null);
    setView({ kind: 'start' });
    // The server forgets it too; if that does not arrive, the link simply runs out in 5 minutes
    cancelWebLogin().catch(() => undefined);
  }, []);

  return { view, login, busy, start, cancel };
}
