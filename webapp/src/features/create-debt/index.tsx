import { useCreateDebt } from '@/entities/debt';
import { useUserStore } from '@/entities/user/model/store';
import { DebtForm } from './ui/DebtForm';
import { useCloseScreen } from '@/shared/lib/navigation';
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
  const closeScreen = useCloseScreen();
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

      // Closes the way «Назад» does: back to the screen that opened the form, never to the form again
      (onSuccess ?? closeScreen)();
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
