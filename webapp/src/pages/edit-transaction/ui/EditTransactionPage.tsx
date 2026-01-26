import { EditTransaction } from '@/features/edit-transaction';
import { Button } from '@/shared/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Edit Transaction Page
 * Dedicated page for editing existing transactions
 */
export function EditTransactionPage() {
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
          <h1 className="text-3xl font-bold">Редактирование</h1>
          <p className="text-muted-foreground mt-1">Измените данные транзакции</p>
        </div>
      </div>

      {/* Edit Transaction Feature (handles loading, errors, form) */}
      <EditTransaction />
    </div>
  );
}
