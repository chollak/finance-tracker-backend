import { useEffect, useRef } from 'react';
import { useUserStore } from '@/entities/user';
import { expiryLine, useWebLogin } from '@/features/web-login';
import { UndoToast } from '@/shared/ui/pastel';
import { LoginView } from './LoginView';

/**
 * In a browser without a session the app is this screen (FT-128, decision Д4: no guest mode). «Войти через Telegram»
 * opens the chat with the bot; once «Подтвердить» is pressed there the page opens the app by itself, at the address it
 * was opened at. The screen's title takes the focus whenever its state changes, as on the boards.
 */
export function LoginPage() {
  const setSessionUser = useUserStore((state) => state.setSessionUser);
  const { view, login, busy, start, cancel } = useWebLogin(setSessionUser);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const shown = useRef<string | null>(null);

  useEffect(() => {
    // Not on the first screen: the page has just opened (the bare frame while it asks is not a screen)
    if (view.kind === 'checking') return;
    if (shown.current !== null && shown.current !== view.kind) titleRef.current?.focus();
    shown.current = view.kind;
  }, [view.kind]);

  return (
    <>
      <LoginView
        view={view}
        login={login}
        expiry={login ? expiryLine(login.expiresAt) : null}
        busy={busy}
        onStart={start}
        onCancel={cancel}
        titleRef={titleRef}
      />
      {/* «Вход отклонён», «Не получилось начать вход» — above the button and the note */}
      <UndoToast bottom={152} />
    </>
  );
}
