import { useNavigate } from 'react-router-dom';
import { useCreateDebt } from '@/entities/debt';
import { useUserStore } from '@/entities/user/model/store';
import { DebtForm } from './ui/DebtForm';
import { ROUTES } from '@/shared/lib/constants';
import type { CreateDebtFormData } from './model/schema';
import { toast } from 'sonner';

interface CreateDebtProps {
  onSuccess?: () => void;
}

/**
 * CreateDebt feature
 * Handles debt creation logic and navigation
 */
export function CreateDebt({ onSuccess }: CreateDebtProps = {}) {
  const navigate = useNavigate();
  const userId = useUserStore((state) => state.userId);
  const createDebt = useCreateDebt(userId || '');

  const handleSubmit = async (data: CreateDebtFormData) => {
    if (!userId) {
      toast.error('Пользователь не авторизован');
      return;
    }

    try {
      await createDebt.mutateAsync(data);

      toast.success('Долг добавлен');

      if (onSuccess) {
        onSuccess();
      } else {
        navigate(ROUTES.DEBTS);
      }
    } catch (error) {
      toast.error('Не удалось создать долг');
      console.error('Failed to create debt:', error);
    }
  };

  return (
    <DebtForm onSubmit={handleSubmit} isLoading={createDebt.isPending} />
  );
}

// Re-export components and types
export { DebtForm } from './ui/DebtForm';
export { createDebtSchema, type CreateDebtFormData } from './model/schema';
