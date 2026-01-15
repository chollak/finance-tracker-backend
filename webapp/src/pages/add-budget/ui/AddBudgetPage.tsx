import { CreateBudget } from '@/features/create-budget';
import { Button } from '@/shared/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';

/**
 * Add Budget Page
 * Dedicated page for creating new budgets
 */
export function AddBudgetPage() {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Новый бюджет</h1>
          <p className="text-muted-foreground mt-1">Создайте план расходов</p>
        </div>
      </div>

      {/* Create Budget Feature */}
      <CreateBudget onSuccess={() => navigate(ROUTES.BUDGETS)} />
    </div>
  );
}
