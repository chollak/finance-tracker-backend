import { ChevronDown, Plus } from 'lucide-react';
import { BalanceCard } from '@/widgets/balance-card';
import { AttentionSummary } from '@/widgets/attention-summary';
import { QuickStats } from '@/widgets/quick-stats';
import { UsageLimitsCard } from '@/widgets/usage-limits';
import { RecentTransactions } from '@/widgets/recent-transactions';
import { BudgetOverview } from '@/widgets/budget-overview';
import { HomeTrustSummary } from '@/widgets/home-trust-summary';
import { HomeHeader } from '@/widgets/home-header';
import { Button } from '@/shared/ui/button';
import { PageShell, SectionStack } from '@/shared/ui';
import { QuickAddSheet } from '@/features/quick-add';
import { TextQuickCaptureCard } from '@/features/quick-capture';
import { GuestModeBanner } from '@/features/auth';

/**
 * Home Page — quick capture first.
 *
 * Order is deliberate: date/status, then the one-line capture card, then the
 * numbers a capture immediately changes (month summary, recent transactions).
 * The older dashboard blocks (budgets, AI usage limits, semantic trust formula,
 * savings stats) are kept — nothing is deleted and every route still works —
 * but they now live below the fold in a collapsed section so they do not
 * compete with capture for the first viewport.
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

        {/* Month summary - the number a capture just changed */}
        <div className="animate-fade-in-up stagger-1">
          <BalanceCard />
        </div>

        {/* Recent Transactions - fast correction of what was just captured */}
        <div className="animate-fade-in-up stagger-2">
          <RecentTransactions />
        </div>

        {/* Attention Summary - renders nothing unless there is a real signal */}
        <div className="animate-fade-in-up stagger-3">
          <AttentionSummary />
        </div>

        {/* Secondary dashboard blocks - preserved, but collapsed by default */}
        <details className="group animate-fade-in-up stagger-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl bg-muted/50 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden">
            <span>Бюджеты, лимиты и объяснение цифр</span>
            <ChevronDown
              className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>

          <div className="mt-4 space-y-4 md:space-y-5">
            <HomeTrustSummary />
            <QuickStats />
            <UsageLimitsCard />
            <BudgetOverview />
          </div>
        </details>
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
