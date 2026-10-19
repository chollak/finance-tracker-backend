import { EditTransaction } from '@/features/edit-transaction';
import { FormPageHeader, PageShell } from '@/shared/ui';

/**
 * Edit Transaction Page
 * Dedicated page for editing existing transactions
 */
export function EditTransactionPage() {
  return (
    <PageShell className="max-w-2xl">
      <FormPageHeader
        title="Редактирование"
        subtitle="Измените данные транзакции"
      />

      {/* Edit Transaction Feature (handles loading, errors, form) */}
      <EditTransaction />
    </PageShell>
  );
}
