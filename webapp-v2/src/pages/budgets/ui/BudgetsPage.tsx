import { useBudgetSummaries, BudgetCard, budgetToViewModel } from '@/entities/budget';
import { useUserStore } from '@/entities/user';
import { BudgetOverview } from '@/widgets/budget-overview';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { Plus, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';

/**
 * Budgets Page
 * Shows list of all budgets with overview
 */
export function BudgetsPage() {
  const navigate = useNavigate();
  const userId = useUserStore((state) => state.userId);
  const { data: budgets, isLoading } = useBudgetSummaries(userId);

  // Transform to ViewModels
  const budgetViewModels = budgets ? budgets.map(budgetToViewModel) : [];

  return (
    <div className="container mx-auto px-4 py-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(ROUTES.HOME)}
          className="md:hidden"
          aria-label="Вернуться на главную"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Бюджеты</h1>
          <p className="text-muted-foreground mt-1" role="status" aria-live="polite">
            {budgetViewModels.length} {budgetViewModels.length === 1 ? 'бюджет' : 'бюджетов'}
          </p>
        </div>
      </div>

      {/* Budget Overview Widget */}
      <div className="mb-6">
        <BudgetOverview />
      </div>

      {/* All Budgets List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Все бюджеты</h2>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : budgetViewModels.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {budgetViewModels.map((budget) => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                onClick={() => navigate(`${ROUTES.BUDGETS}/${budget.id}/edit`)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground mb-4">У вас пока нет бюджетов</p>
            <Button onClick={() => navigate(ROUTES.ADD_BUDGET)}>
              Создать первый бюджет
            </Button>
          </div>
        )}
      </div>

      {/* Floating Action Button - Add Budget */}
      <Button
        size="lg"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg md:h-auto md:w-auto md:rounded-md md:px-6"
        onClick={() => navigate(ROUTES.ADD_BUDGET)}
        aria-label="Создать бюджет"
      >
        <Plus className="h-6 w-6 md:mr-2" aria-hidden="true" />
        <span className="hidden md:inline">Создать бюджет</span>
      </Button>
    </div>
  );
}
