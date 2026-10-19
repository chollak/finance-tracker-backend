import { Wordmark } from '@/shared/ui/pastel';
import { OpeningBalancesForm } from '@/features/opening-balances';

/**
 * First launch (FT-109, boards «Первый запуск», «Первый запуск · суммы введены»): one screen, no tour.
 * Shown instead of the app while the first launch is not done (see the router's FirstLaunchGate).
 */
export function FirstLaunchPage() {
  return (
    <main className="flex min-h-dvh flex-col gap-3 bg-bg px-4 pb-6 pt-2 text-ink">
      <header className="flex h-key shrink-0 items-center">
        <Wordmark />
      </header>
      <div className="flex flex-col gap-1.5 px-1 pt-1">
        <h1 className="text-[26px] font-extrabold leading-[1.2] tracking-[-0.8px]">Сколько у вас сейчас денег?</h1>
        <p className="type-body text-ink-muted">С этих сумм Daftar начнёт считать. Это не доход — просто остатки на сегодня.</p>
      </div>
      <OpeningBalancesForm className="flex-1" />
    </main>
  );
}
