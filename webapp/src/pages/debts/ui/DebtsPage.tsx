import { useDebts, useDebtSummary, DebtCard } from '@/entities/debt';
import { useUserStore } from '@/entities/user/model/store';
import { Button, EmptyState } from '@/shared/ui';
import { Skeleton } from '@/shared/ui/skeleton';
import { Card } from '@/shared/ui/card';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { formatCurrency } from '@/shared/lib/formatters';
import { useState } from 'react';
import { cn } from '@/shared/lib/utils';

type FilterTab = 'all' | 'i_owe' | 'owed_to_me';

/**
 * Debts Page
 * Shows list of all debts with summary
 */
export function DebtsPage() {
  const navigate = useNavigate();
  const userId = useUserStore((state) => state.userId);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const { data: debts, isLoading } = useDebts(userId, {
    status: 'active',
    type: activeTab === 'all' ? undefined : activeTab,
  });
  const { data: summary } = useDebtSummary(userId);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'i_owe', label: 'Я должен' },
    { key: 'owed_to_me', label: 'Мне должны' },
  ];

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Долги</h1>
        <p className="text-muted-foreground mt-1" role="status" aria-live="polite">
          {debts?.length || 0} активных долгов
        </p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground mb-1">Я должен</div>
            <div className="text-xl font-bold text-expense">
              {formatCurrency(summary.totalIOwe)}
            </div>
            <div className="text-xs text-muted-foreground">
              {summary.iOweCount} долгов
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground mb-1">Мне должны</div>
            <div className="text-xl font-bold text-income">
              {formatCurrency(summary.totalOwedToMe)}
            </div>
            <div className="text-xs text-muted-foreground">
              {summary.owedToMeCount} долгов
            </div>
          </Card>
        </div>
      )}

      {/* Net Balance */}
      {summary && summary.netBalance !== 0 && (
        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Чистый баланс</span>
            <span className={cn(
              'text-xl font-bold',
              summary.netBalance > 0 ? 'text-income' : 'text-expense'
            )}>
              {summary.netBalance > 0 ? '+' : ''}{formatCurrency(summary.netBalance)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {summary.netBalance > 0
              ? 'Вам должны больше, чем вы должны'
              : 'Вы должны больше, чем вам должны'
            }
          </p>
        </Card>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
              activeTab === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Debts List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : debts && debts.length > 0 ? (
          <div className="space-y-4">
            {debts.map((debt) => (
              <DebtCard
                key={debt.id}
                debt={debt}
                onClick={() => navigate(ROUTES.DEBT_DETAILS(debt.id))}
              />
            ))}
          </div>
        ) : (
          <div className="border-2 border-dashed rounded-lg">
            <EmptyState
              icon="💰"
              title="Нет активных долгов"
              description="Добавьте долг, чтобы отслеживать кто кому должен"
              tip="Долги помогут вам не забыть о взаиморасчётах с друзьями и знакомыми"
              action={
                <Button onClick={() => navigate(ROUTES.ADD_DEBT)}>
                  Добавить долг
                </Button>
              }
              size="lg"
            />
          </div>
        )}
      </div>

      {/* Floating Action Button - Add Debt */}
      <Button
        size="lg"
        className="fixed bottom-20 md:bottom-6 right-6 h-14 w-14 rounded-full shadow-lg md:h-auto md:w-auto md:rounded-md md:px-6"
        onClick={() => navigate(ROUTES.ADD_DEBT)}
        aria-label="Добавить долг"
      >
        <Plus className="h-6 w-6 md:mr-2" aria-hidden="true" />
        <span className="hidden md:inline">Добавить долг</span>
      </Button>
    </div>
  );
}
