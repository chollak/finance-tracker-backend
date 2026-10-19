import { AddTransaction } from '@/features/add-transaction';
import { FormPageHeader, PageShell } from '@/shared/ui';

/**
 * Add Transaction Page
 * Dedicated page for adding new transactions
 */
export function AddTransactionPage() {
  return (
    <PageShell className="max-w-2xl">
      <FormPageHeader
        title="Новая транзакция"
        subtitle="Добавьте доход или расход"
      />

      {/* Add Transaction Feature: a saved record closes the form the way «Назад» does */}
      <AddTransaction showHeader={false} />
    </PageShell>
  );
}
