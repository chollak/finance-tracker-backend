import { EditBudget } from '@/features/edit-budget';
import { FormPageHeader, PageShell } from '@/shared/ui';

/**
 * Edit Budget Page
 * Dedicated page for editing existing budgets
 */
export function EditBudgetPage() {
  return (
    <PageShell className="max-w-2xl">
      <FormPageHeader
        title="Редактирование"
        subtitle="Измените данные бюджета"
      />

      {/* Edit Budget Feature (handles loading, errors, form) */}
      <EditBudget />
    </PageShell>
  );
}
