import { CreateDebt } from '@/features/create-debt';
import { FormPageHeader, PageShell } from '@/shared/ui';

/**
 * Add Debt Page
 * Dedicated page for creating new debts
 */
export function AddDebtPage() {
  return (
    <PageShell className="max-w-2xl">
      <FormPageHeader
        title="Новый долг"
        subtitle="Добавьте запись о долге"
      />

      {/* Create Debt Feature: a created debt closes the form the way «Назад» does */}
      <CreateDebt />
    </PageShell>
  );
}
