import { CreateDebt } from '@/features/create-debt';
import { Button } from '@/shared/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';

/**
 * Add Debt Page
 * Dedicated page for creating new debts
 */
export function AddDebtPage() {
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
          <h1 className="text-3xl font-bold">Новый долг</h1>
          <p className="text-muted-foreground mt-1">Добавьте запись о долге</p>
        </div>
      </div>

      {/* Create Debt Feature */}
      <CreateDebt onSuccess={() => navigate(ROUTES.DEBTS)} />
    </div>
  );
}
