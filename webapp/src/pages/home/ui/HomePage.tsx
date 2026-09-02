import { BalanceCard } from '@/widgets/balance-card';
import { AttentionSummary } from '@/widgets/attention-summary';
import { QuickStats } from '@/widgets/quick-stats';
import { UsageLimitsCard } from '@/widgets/usage-limits';
import { RecentTransactions } from '@/widgets/recent-transactions';
import { BudgetOverview } from '@/widgets/budget-overview';
import { HomeTrustSummary } from '@/widgets/home-trust-summary';
import { Button } from '@/shared/ui/button';
import { PageHeader, PageShell, SectionStack } from '@/shared/ui';
import { Plus } from 'lucide-react';
import { QuickAddSheet } from '@/features/quick-add';
import { TextQuickCaptureCard } from '@/features/quick-capture';
import { GuestModeBanner } from '@/features/auth';

/**
 * Home Page (Dashboard)
 * Main entry point showing overview of finances
 */
export function HomePage() {
  return (
    <PageShell>
      <PageHeader title="Главная" subtitle="Обзор ваших финансов" />

      {/* Guest Mode Banner */}
      <GuestModeBanner className="mb-4" />

      {/* Main Content */}
      <SectionStack>
        {/* Balance Card - Full Width */}
        <div className="animate-fade-in-up">
          <BalanceCard />
        </div>

        {/* Quick Capture - one line of text through the same boundary the Telegram bot uses */}
        <div className="animate-fade-in-up stagger-1">
          <TextQuickCaptureCard />
        </div>

        {/* Semantic trust formula - explains why real expenses differ from outgoing cashflow */}
        <div className="animate-fade-in-up stagger-1">
          <HomeTrustSummary />
        </div>

        {/* Attention Summary - what needs a decision right now */}
        <div className="animate-fade-in-up stagger-1">
          <AttentionSummary />
        </div>

        {/* Quick Stats - Grid */}
        <div className="animate-fade-in-up stagger-1">
          <QuickStats />
        </div>

        {/* Usage Limits - Only for Free users */}
        <div className="animate-fade-in-up stagger-1">
          <UsageLimitsCard />
        </div>

        {/* Two Column Layout on Desktop */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Budget Overview */}
          <div className="animate-fade-in-up stagger-2">
            <BudgetOverview />
          </div>

          {/* Recent Transactions */}
          <div className="animate-fade-in-up stagger-3">
            <RecentTransactions />
          </div>
        </div>
      </SectionStack>

      {/* Floating Action Button - Quick Add Transaction */}
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
