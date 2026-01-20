import { BalanceCard } from '@/widgets/balance-card';
import { QuickStats } from '@/widgets/quick-stats';
import { UsageLimitsCard } from '@/widgets/usage-limits';
import { RecentTransactions } from '@/widgets/recent-transactions';
import { BudgetOverview } from '@/widgets/budget-overview';
import { Button } from '@/shared/ui/button';
import { ThemeToggle } from '@/shared/ui/theme-toggle';
import { Plus } from 'lucide-react';
import { QuickAddSheet } from '@/features/quick-add';
import { GuestModeBanner } from '@/features/auth';
import { SyncButton } from '@/features/sync';

/**
 * Home Page (Dashboard)
 * Main entry point showing overview of finances
 */
export function HomePage() {
  return (
    <div className="container mx-auto px-4 py-6">
      {/* Page Title with Theme Toggle */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Главная</h1>
          <p className="text-muted-foreground mt-1">Обзор ваших финансов</p>
        </div>
        {/* Actions - visible on mobile (hidden on desktop via TopNav) */}
        <div className="flex items-center gap-2 md:hidden">
          <SyncButton />
          <ThemeToggle />
        </div>
      </div>

      {/* Guest Mode Banner */}
      <GuestModeBanner className="mb-6" />

      {/* Main Content */}
      <div className="space-y-6">
        {/* Balance Card - Full Width */}
        <div className="animate-fade-in-up">
          <BalanceCard />
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Budget Overview */}
          <div className="animate-fade-in-up stagger-2">
            <BudgetOverview />
          </div>

          {/* Recent Transactions */}
          <div className="animate-fade-in-up stagger-3">
            <RecentTransactions />
          </div>
        </div>
      </div>

      {/* Floating Action Button - Quick Add Transaction */}
      <QuickAddSheet>
        <Button
          size="lg"
          className="fixed bottom-20 md:bottom-6 right-6 h-14 w-14 rounded-full shadow-lg md:h-auto md:w-auto md:rounded-md md:px-6"
          aria-label="Добавить транзакцию"
        >
          <Plus className="h-6 w-6 md:mr-2" aria-hidden="true" />
          <span className="hidden md:inline">Добавить транзакцию</span>
        </Button>
      </QuickAddSheet>
    </div>
  );
}
