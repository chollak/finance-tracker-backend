import { AddTransaction } from '@/features/add-transaction';
import { FormPageHeader, PageShell } from '@/shared/ui';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';

/**
 * Add Transaction Page
 * Dedicated page for adding new transactions
 */
export function AddTransactionPage() {
  const navigate = useNavigate();

  return (
    <PageShell as="main" className="max-w-2xl">
      <FormPageHeader
        title="Новая транзакция"
        subtitle="Добавьте доход или расход"
        onBack={() => navigate(-1)}
      />

      {/* Add Transaction Feature */}
      <AddTransaction onSuccess={() => navigate(ROUTES.HOME)} showHeader={false} />
    </PageShell>
  );
}
