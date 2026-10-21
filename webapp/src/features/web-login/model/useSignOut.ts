import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { closeSession, useUserStore } from '@/entities/user';
import { forgetCachedResponses } from '@/shared/api';
import { ROUTES } from '@/shared/lib/constants/routes';
import { showUndoToast, useUndoToastStore } from '@/shared/lib/undo';
import { LOGIN_NOTICES } from './webLogin';

/**
 * «Выйти» in «Ещё» by a direct link (FT-128, board «„Ещё“ в браузере»): the session ends in this browser only — the
 * records stay, and so do other browsers and Telegram. What the app had read is dropped — the query cache and the
 * service worker's API answers — and the login screen shows; the next sign-in opens Home. If the server was not reached
 * the user stays signed in and is told.
 */
export function useSignOut(): { signOut: () => void; pending: boolean } {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  const signOut = () => {
    if (pending) return;
    setPending(true);
    closeSession()
      .then(async () => {
        // Before the login screen: the next account in this browser must not be served this one's answers
        await forgetCachedResponses();
        navigate(ROUTES.HOME, { replace: true });
        useUserStore.getState().setSignedOut();
        useUndoToastStore.getState().clear();
        queryClient.clear();
      })
      .catch(() => {
        showUndoToast({ kind: 'info', ...LOGIN_NOTICES.signOutFailed });
        setPending(false);
      });
  };

  return { signOut, pending };
}
