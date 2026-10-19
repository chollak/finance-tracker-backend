import { BalanceCard } from '@/widgets/balance-card';
import { SummaryTiles } from '@/widgets/summary-tiles';
import { RecentTransactions } from '@/widgets/recent-transactions';
import { HomeHeader } from '@/widgets/home-header';
import { HomeSkeleton } from '@/widgets/home-skeleton';
import { PageShell } from '@/shared/ui';
import { UndoToast } from '@/shared/ui/pastel';
import { Composer } from '@/features/quick-capture';
import { GuestModeBanner } from '@/features/auth';
import { useIsGuest } from '@/entities/user';
import { useHomeLoading } from '../model/homeLoading';

/**
 * Home Page — the shell of the app (FT-110) with the boards' content (FT-111, «Главная», «Главная после
 * первого запуска»): the balance card with the accounts and the month's spend share, the month tiles of
 * income and expenses, and the recent records by day.
 *
 * There is no bottom bar: the header carries the daftar sign and «Ещё», the tiles open Analytics, «Все»
 * over the records opens History, and every other section is in «Ещё» — nothing is further than two taps.
 * The composer is fixed to the bottom (FT-114, Composer.md): quick chips that write in one tap, the field
 * whose phrase opens the review of its records, «Ввести вручную»; the page leaves room under the records for
 * it, and «Записано» shows over it. Guests keep records on the device and have no accounts (guest mode goes
 * with FT-128), so they see the composer and their records only.
 *
 * Until each of its first reads has answered once Home is its skeleton (FT-112), the same one the app opens
 * on; a read that failed is then the business of its section, which says so and reads it again.
 */
export function HomePage() {
  const isGuest = useIsGuest();
  const loading = useHomeLoading();

  // The toast of a record saved elsewhere (FT-113) shows over the skeleton too: Home may still be reading
  if (loading) {
    return (
      <>
        <HomeSkeleton />
        <UndoToast />
      </>
    );
  }

  return (
    <PageShell className="pt-2 pb-[calc(10rem+env(safe-area-inset-bottom))] md:pt-2">
      {/* For everyone else the balance card's «Всего на счетах» is the screen's heading */}
      {isGuest && <h1 className="sr-only">Главная</h1>}
      <HomeHeader className="mb-4" />

      <GuestModeBanner className="mb-4" />

      <div className="flex flex-col gap-4">
        {!isGuest && <BalanceCard />}
        {!isGuest && <SummaryTiles />}
        <RecentTransactions />
      </div>

      <Composer />

      {/* «Записано» with «Отменить» over the composer (Toast.md): after a chip, a review, a manual entry */}
      <UndoToast bottom={160} />
    </PageShell>
  );
}
