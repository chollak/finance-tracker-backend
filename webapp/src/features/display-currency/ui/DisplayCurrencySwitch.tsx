import { cn } from '@/shared/lib/utils';
import type { Currency } from '@/shared/lib/money';
import { Segmented } from '@/shared/ui/pastel';
import { useDisplayCurrency } from '../api/useDisplayCurrency';
import { usdUnavailableLabel } from '../model/displayCurrency';

/**
 * «Сум / USD» in the header of Home (FT-137, boards «Главная», «Главная · тёмная»; Segmented.md): 124px
 * beside «Ещё», as on the boards. The pressed segment is what Home shows, so without a rate «Сум» stays
 * pressed whatever was chosen, and «USD» is dimmed: pressing it says why.
 */
export function DisplayCurrencySwitch({ className }: { className?: string }) {
  const { shown, usdUnavailable, choose } = useDisplayCurrency();

  return (
    <Segmented<Currency>
      ariaLabel="Валюта отображения"
      value={shown}
      onChange={choose}
      onUnavailable={choose}
      options={[
        { value: 'UZS', label: 'Сум' },
        {
          value: 'USD',
          label: 'USD',
          unavailable: usdUnavailable !== null,
          ariaLabel: usdUnavailable ? usdUnavailableLabel(usdUnavailable) : undefined,
        },
      ]}
      className={cn('w-[124px] shrink-0', className)}
    />
  );
}
