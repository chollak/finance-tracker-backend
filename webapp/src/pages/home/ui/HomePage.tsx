import { BalanceCard } from '@/widgets/balance-card';
import { SummaryTiles } from '@/widgets/summary-tiles';
import { AuditCard } from '@/widgets/audit-card';
import { RecentTransactions } from '@/widgets/recent-transactions';
import { HomeHeader } from '@/widgets/home-header';
import { HomeSkeleton } from '@/widgets/home-skeleton';
import { PageShell } from '@/shared/ui';
import { OfflineBar, UndoToast } from '@/shared/ui/pastel';
import { useIsOffline } from '@/shared/lib/offline';
import { Composer } from '@/features/quick-capture';
import { RecordSheet, useRecordLink } from '@/features/record-sheet';
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
 * it, and «Записано» shows over it.
 *
 * Until each of its first reads has answered once Home is its skeleton (FT-112), the same one the app opens
 * on; a read that failed is then the business of its section, which says so and reads it again.
 *
 * Under the tiles one card about the spending audit (FT-132, InviteCard.md): the invitation with «Позже» while the audit
 * of the month before waits, «Цели после ревизии» after it.
 *
 * A recent record opens its sheet (FT-115), and so does a link to a record (`ROUTES.RECORD`: the bot's
 * «Изменить»), which the sheet shows once Home is there.
 *
 * Without a connection (FT-129, boards «Главная без связи») one line under the header says so, Home opens on what
 * was kept on the device, and the composer writes there.
 */
export function HomePage() {
  const loading = useHomeLoading();
  const offline = useIsOffline();
  useRecordLink();

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
      {/* The balance card's «Всего на счетах» is the screen's heading */}
      <HomeHeader className="mb-4" />

      <div className="flex flex-col gap-4">
        {offline && <OfflineBar />}
        <BalanceCard />
        <SummaryTiles />
        <AuditCard />
        <RecentTransactions />
      </div>

      <Composer />

      {/* «Записано» with «Отменить» over the composer (Toast.md): after a chip, a review, a manual entry, and
          «Удалено» or «Категория изменена» after the record sheet */}
      <UndoToast bottom={160} />

      <RecordSheet />
    </PageShell>
  );
}
