import { AddTransaction } from '@/features/add-transaction';
import { FormPageHeader } from '@/shared/ui';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';

/**
 * Add Transaction Page
 * Dedicated page for adding new transactions
 */
export function AddTransactionPage() {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6">
      <FormPageHeader
        title="Новая транзакция"
        subtitle="Добавьте доход или расход"
        onBack={() => navigate(-1)}
      />

      {/* Add Transaction Feature */}
      <AddTransaction onSuccess={() => navigate(ROUTES.HOME)} />
    </div>
  );
}
