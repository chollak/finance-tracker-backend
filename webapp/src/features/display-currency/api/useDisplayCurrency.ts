import { useCallback } from 'react';
import { useSettings, useUpdateSettings } from '@/entities/settings';
import { useUsdRate } from '@/entities/rate';
import type { Currency } from '@/shared/lib/money';
import { showUndoToast } from '@/shared/lib/undo';
import {
  displayCurrencyState,
  SAVE_FAILED_NOTICE,
  usdUnavailableNotice,
  type DisplayCurrencyNotice,
  type DisplayCurrencyState,
} from '../model/displayCurrency';

const notify = (notice: DisplayCurrencyNotice) => showUndoToast({ kind: 'info', title: notice.title, detail: notice.detail });

export interface DisplayCurrency extends DisplayCurrencyState {
  /** Show and remember this currency; «USD» without a rate says why instead (and reads a failed rate again). */
  choose: (currency: Currency) => void;
}

/**
 * The display currency of Home (FT-137) from the user's settings and the rate in effect, and the way to
 * change it: the choice shows at once and is saved in the settings, so Home opens in it next time; a save
 * that failed puts the old choice back and says so.
 */
export function useDisplayCurrency(): DisplayCurrency {
  const settings = useSettings();
  const rates = useUsdRate();
  const update = useUpdateSettings({ onError: () => notify(SAVE_FAILED_NOTICE) });
  const state = displayCurrencyState({
    chosen: settings.data?.displayCurrency,
    rateMinor: rates.data?.effective?.rateMinor ?? null,
    rateFailed: rates.isError,
  });

  const { mutate } = update;
  const { refetch } = rates;
  const { chosen, usdUnavailable } = state;
  const choose = useCallback(
    (currency: Currency) => {
      if (currency === 'USD' && usdUnavailable) {
        notify(usdUnavailableNotice(usdUnavailable));
        if (usdUnavailable === 'failed') void refetch();
        return;
      }
      if (currency !== chosen) mutate({ displayCurrency: currency });
    },
    [chosen, usdUnavailable, mutate, refetch]
  );

  return { ...state, choose };
}
