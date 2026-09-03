import { Plus } from 'lucide-react';
import { AttentionSummary } from '@/widgets/attention-summary';
import { RecentTransactions } from '@/widgets/recent-transactions';
import { HomeHeader } from '@/widgets/home-header';
import { Button } from '@/shared/ui/button';
import { PageShell, SectionStack } from '@/shared/ui';
import { QuickAddSheet } from '@/features/quick-add';
import { TextQuickCaptureCard } from '@/features/quick-capture';
import { GuestModeBanner } from '@/features/auth';

/**
 * Home Page — quick capture first.
 *
 * Home is deliberately minimal: date/status, the one-line capture card, the
 * transactions a capture just changed, and an attention block that renders
 * nothing unless there is a real signal. Everything else (balance, budgets,
 * AI usage limits, semantic trust formula, savings stats) stays implemented
 * and routable — it is reachable from More, just not competing with capture
 * for the first viewport.
 */
export function HomePage() {
  return (
    <PageShell>
      <HomeHeader />

      {/* Guest Mode Banner */}
      <GuestModeBanner className="mb-4" />

      {/* Main Content */}
      <SectionStack>
        {/* Quick Capture - one line of text through the same boundary the Telegram bot uses */}
        <div className="animate-fade-in-up">
          <TextQuickCaptureCard />
        </div>

        {/* Recent Transactions - fast correction of what was just captured */}
        <div className="animate-fade-in-up stagger-1">
          <RecentTransactions />
        </div>

        {/* Attention Summary - renders nothing unless there is a real signal */}
        <div className="animate-fade-in-up stagger-2">
          <AttentionSummary />
        </div>
      </SectionStack>

      {/* Floating Action Button - Quick Add Transaction (desktop only) */}
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
