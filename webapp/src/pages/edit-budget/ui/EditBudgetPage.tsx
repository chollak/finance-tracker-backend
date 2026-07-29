import { EditBudget } from '@/features/edit-budget';
import { FormPageHeader, PageShell } from '@/shared/ui';
import { useNavigate } from 'react-router-dom';

/**
 * Edit Budget Page
 * Dedicated page for editing existing budgets
 */
export function EditBudgetPage() {
  const navigate = useNavigate();

  return (
    <PageShell as="main" className="max-w-2xl">
      <FormPageHeader
        title="Редактирование"
        subtitle="Измените данные бюджета"
        onBack={() => navigate(-1)}
      />

      {/* Edit Budget Feature (handles loading, errors, form) */}
      <EditBudget />
    </PageShell>
  );
}
