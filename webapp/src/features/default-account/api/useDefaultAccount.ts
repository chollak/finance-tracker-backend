import { useCallback } from 'react';
import { useAccounts } from '@/entities/account';
import { useSettings, useUpdateSettings } from '@/entities/settings';
import { showUndoToast } from '@/shared/lib/undo';
import { defaultAccountSaveNotice, defaultAccountView, type DefaultAccountView } from '../model/defaultAccount';

export interface DefaultAccount {
  /** Null while the accounts or the settings are read, or when they failed to be. */
  view: DefaultAccountView | null;
  /** The accounts or the settings did not load. */
  failed: boolean;
  /** Reading them again. */
  retrying: boolean;
  retry: () => void;
  /** Saves the account as `defaultAccountId`; the account already chosen saves nothing. */
  choose: (accountId: string) => void;
}

/**
 * The default account (FT-149) from the user's accounts and settings, and the way to change it. The choice is the
 * `defaultAccountId` setting (`PATCH /api/settings`): the settings in the cache take it before the answer, so the
 * chips, manual entry and a phrase written without a connection use it at once; the server uses it for a phrase sent
 * online. A save that failed puts back what the server has and says why: the server refused the account, or no answer.
 */
export function useDefaultAccount(): DefaultAccount {
  const accounts = useAccounts();
  const settings = useSettings();
  const { refetch: refetchAccounts } = accounts;
  const { mutate } = useUpdateSettings({
    onError: (error) => {
      showUndoToast({ kind: 'info', ...defaultAccountSaveNotice(error) });
      // Refused (hidden or deleted elsewhere meanwhile): the accounts here are older than the server's
      if (error.statusCode === 400) void refetchAccounts();
    },
  });

  const view = accounts.data && settings.data ? defaultAccountView(accounts.data.accounts, settings.data.defaultAccountId) : null;
  const chosenId = settings.data?.defaultAccountId;

  const choose = useCallback(
    (accountId: string) => {
      if (accountId !== chosenId) mutate({ defaultAccountId: accountId });
    },
    [chosenId, mutate]
  );

  const retry = () => {
    if (accounts.isError) void accounts.refetch();
    if (settings.isError) void settings.refetch();
  };

  return {
    view,
    failed: !view && (accounts.isError || settings.isError),
    retrying: accounts.isFetching || settings.isFetching,
    retry,
    choose,
  };
}
