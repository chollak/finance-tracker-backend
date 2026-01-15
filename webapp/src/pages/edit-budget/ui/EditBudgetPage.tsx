import { EditBudget } from '@/features/edit-budget';
import { Button } from '@/shared/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Edit Budget Page
 * Dedicated page for editing existing budgets
 */
export function EditBudgetPage() {
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
      </div>

      {/* Edit Budget Feature (handles loading, errors, form) */}
      <EditBudget />
    </div>
  );
}
