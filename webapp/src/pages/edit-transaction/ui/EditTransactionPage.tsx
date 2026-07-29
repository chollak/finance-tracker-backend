import { EditTransaction } from '@/features/edit-transaction';
import { FormPageHeader, PageShell } from '@/shared/ui';
import { useNavigate } from 'react-router-dom';

/**
 * Edit Transaction Page
 * Dedicated page for editing existing transactions
 */
export function EditTransactionPage() {
  const navigate = useNavigate();

  return (
    <PageShell as="main" className="max-w-2xl">
      <FormPageHeader
        title="Редактирование"
        subtitle="Измените данные транзакции"
        onBack={() => navigate(-1)}
      />

      {/* Edit Transaction Feature (handles loading, errors, form) */}
      <EditTransaction />
    </PageShell>
  );
}
