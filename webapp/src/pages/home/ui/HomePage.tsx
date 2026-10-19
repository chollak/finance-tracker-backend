import { Plus } from 'lucide-react';
import { BalanceCard } from '@/widgets/balance-card';
import { SummaryTiles } from '@/widgets/summary-tiles';
import { RecentTransactions } from '@/widgets/recent-transactions';
import { HomeHeader } from '@/widgets/home-header';
import { HomeSkeleton } from '@/widgets/home-skeleton';
import { Button } from '@/shared/ui/button';
import { PageShell } from '@/shared/ui';
import { QuickAddSheet } from '@/features/quick-add';
import { TextQuickCaptureCard } from '@/features/quick-capture';
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
 * The one-line capture card stays between the tiles and the records until FT-114 brings the composer of the
 * boards. Guests keep records on the device and have no accounts (guest mode goes with FT-128), so they see
 * the capture card and their records only.
 *
 * Until its first reads have answered Home is its skeleton (FT-112), the same one the app opens on.
 */
export function HomePage() {
  const isGuest = useIsGuest();
  const loading = useHomeLoading();

  if (loading) return <HomeSkeleton />;

  return (
    <PageShell className="pt-2 md:pt-2">
      {/* For everyone else the balance card's «Всего на счетах» is the screen's heading */}
      {isGuest && <h1 className="sr-only">Главная</h1>}
      <HomeHeader className="mb-4" />

      <GuestModeBanner className="mb-4" />

      <div className="flex flex-col gap-4">
        {!isGuest && <BalanceCard />}
        {!isGuest && <SummaryTiles />}

        {/* Quick Capture - one line of text through the same boundary the Telegram bot uses */}
        <TextQuickCaptureCard />

        <RecentTransactions />
      </div>

      {/* Floating Action Button - Quick Add Transaction (desktop only; FT-113 replaces it) */}
      <QuickAddSheet>
        <Button
          size="lg"
          className="hidden md:fixed md:bottom-6 right-6 h-14 w-14 rounded-full shadow-lg md:flex md:h-auto md:w-auto md:rounded-md md:px-6"
          aria-label="Добавить транзакцию"
        >
          <Plus className="h-6 w-6 md:mr-2" aria-hidden="true" />
          <span className="hidden md:inline">Добавить транзакцию</span>
        </Button>
      </QuickAddSheet>
    </PageShell>
  );
}
