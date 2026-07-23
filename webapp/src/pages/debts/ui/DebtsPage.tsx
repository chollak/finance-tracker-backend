import { useDebts, useDebtSummary, DebtCard } from '@/entities/debt';
import { useUserStore, useIsGuest } from '@/entities/user/model/store';
import { Button, EmptyState, PageHeader, SegmentedButtonGroup } from '@/shared/ui';
import { Skeleton } from '@/shared/ui/skeleton';
import { Card } from '@/shared/ui/card';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { formatCurrency } from '@/shared/lib/formatters';
import { useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { GuestFeatureBlock } from '@/features/auth';

type FilterTab = 'all' | 'i_owe' | 'owed_to_me';

/**
 * Debts Page
 * Shows list of all debts with summary
 * Guest users see login prompt
 */
export function DebtsPage() {
  const navigate = useNavigate();
  const userId = useUserStore((state) => state.userId);
  const isGuest = useIsGuest();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const { data: debts, isLoading } = useDebts(userId, {
    status: 'active',
    type: activeTab === 'all' ? undefined : activeTab,
  });
  const { data: summary } = useDebtSummary(userId);

  // Guest users: show login prompt
  if (isGuest) {
    return (
      <div className="container mx-auto px-4 py-6">
        <PageHeader title="Долги" />
        <GuestFeatureBlock
          title="Долги доступны после входа"
          description="Отслеживайте кто вам должен и кому должны вы. Фиксируйте платежи и получайте напоминания."
        />
      </div>
    );
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'i_owe', label: 'Я должен' },
    { key: 'owed_to_me', label: 'Мне должны' },
  ];

  return (
    <div className="container mx-auto px-4 py-6">
      <PageHeader title="Долги" subtitle={`${debts?.length || 0} активных долгов`} />

      {/* Mobile create action — avoid a competing FAB above the global bottom nav */}
      {!isLoading && debts && debts.length > 0 && (
        <Button
          className="mb-6 w-full gap-2 rounded-2xl md:hidden"
          onClick={() => navigate(ROUTES.ADD_DEBT)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Добавить долг
        </Button>
      )}

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

      <SegmentedButtonGroup
        options={tabs.map((tab) => ({ value: tab.key, label: tab.label }))}
        value={activeTab}
        onChange={setActiveTab}
        className="grid-cols-3"
        ariaLabel="Фильтр долгов"
      />

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

      {/* Desktop create action — mobile uses in-page/empty-state CTA */}
      <Button
        size="lg"
        className="hidden md:fixed md:bottom-6 md:right-6 md:flex md:h-auto md:w-auto md:rounded-md md:px-6 md:shadow-lg"
        onClick={() => navigate(ROUTES.ADD_DEBT)}
        aria-label="Добавить долг"
      >
        <Plus className="h-6 w-6 md:mr-2" aria-hidden="true" />
        <span className="hidden md:inline">Добавить долг</span>
      </Button>
    </div>
  );
}
