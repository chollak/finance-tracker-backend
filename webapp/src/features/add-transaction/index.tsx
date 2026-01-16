import { useNavigate } from 'react-router-dom';
import { useCreateTransaction } from '@/entities/transaction';
import { useUserStore } from '@/entities/user/model/store';
import { TransactionForm } from './ui/TransactionForm';
import { ROUTES } from '@/shared/lib/constants';
import type { AddTransactionFormData } from './model/schema';
import { toast } from 'sonner';

interface AddTransactionProps {
  onSuccess?: () => void;
}

/**
 * AddTransaction feature
 * Handles transaction creation logic and navigation
 */
export function AddTransaction({ onSuccess }: AddTransactionProps = {}) {
  const navigate = useNavigate();
  const userId = useUserStore((state) => state.userId);
  const userName = useUserStore((state) => state.userName);
  const createTransaction = useCreateTransaction();

  const handleSubmit = async (data: AddTransactionFormData) => {
    if (!userId) {
      toast.error('Пользователь не авторизован');
      return;
    }

    try {
      await createTransaction.mutateAsync({
        ...data,
        userId,
        userName: userName || undefined,
      });

      toast.success('Транзакция добавлена');

      if (onSuccess) {
        onSuccess();
      } else {
        navigate(ROUTES.HOME);
      }
    } catch (error) {
      toast.error('Не удалось добавить транзакцию');
      console.error('Failed to create transaction:', error);
    }
  };

  return (
    <div className="container max-w-2xl py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Добавить транзакцию</h1>
        <p className="text-muted-foreground">Запишите новый доход или расход</p>
      </div>

      <TransactionForm onSubmit={handleSubmit} isLoading={createTransaction.isPending} />
    </div>
  );
}

// Re-export components and types
export { TransactionForm } from './ui/TransactionForm';
export { addTransactionSchema, type AddTransactionFormData } from './model/schema';
