import { CreateBudget } from '@/features/create-budget';
import { FormPageHeader, PageShell } from '@/shared/ui';

/**
 * Add Budget Page
 * Dedicated page for creating new budgets
 */
export function AddBudgetPage() {
  return (
    <PageShell className="max-w-2xl">
      <FormPageHeader
        title="Новый бюджет"
        subtitle="Создайте план расходов"
      />

      {/* Create Budget Feature: a created budget closes the form the way «Назад» does */}
      <CreateBudget />
    </PageShell>
  );
}
