import { BalanceCard } from '@/widgets/balance-card';
import { QuickStats } from '@/widgets/quick-stats';
import { RecentTransactions } from '@/widgets/recent-transactions';
import { AlertsPanel } from '@/widgets/alerts-panel';
import { BudgetOverview } from '@/widgets/budget-overview';
import { Button } from '@/shared/ui/button';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';

/**
 * Home Page (Dashboard)
 * Main entry point showing overview of finances
 */
export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto px-4 py-6 pb-24 md:pb-6">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Главная</h1>
        <p className="text-muted-foreground mt-1">Обзор ваших финансов</p>
      </div>

      {/* Main Content */}
      <div className="space-y-6">
        {/* Balance Card - Full Width */}
        <BalanceCard />

        {/* Quick Stats - Grid */}
        <QuickStats />

        {/* Alerts Panel - Important */}
        <AlertsPanel />

        {/* Two Column Layout on Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Budget Overview */}
          <BudgetOverview />

          {/* Recent Transactions */}
          <RecentTransactions />
        </div>
      </div>

      {/* Floating Action Button - Add Transaction */}
      <Button
        size="lg"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg md:h-auto md:w-auto md:rounded-md md:px-6"
        onClick={() => navigate(ROUTES.ADD_TRANSACTION)}
      >
        <Plus className="h-6 w-6 md:mr-2" />
        <span className="hidden md:inline">Добавить транзакцию</span>
      </Button>
    </div>
  );
}
