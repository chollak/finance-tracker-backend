import { useCreateTransaction } from '@/entities/transaction';
import { useUserStore } from '@/entities/user/model/store';
import { TransactionForm } from './ui/TransactionForm';
import { useCloseScreen } from '@/shared/lib/navigation';
import type { TransactionFormResult } from './ui/TransactionForm';
import { toast } from 'sonner';

interface AddTransactionProps {
  onSuccess?: () => void;
  showHeader?: boolean;
}

/**
 * AddTransaction feature
 * Handles transaction creation logic and navigation
 */
export function AddTransaction({ onSuccess, showHeader = true }: AddTransactionProps = {}) {
  const closeScreen = useCloseScreen();
  const userId = useUserStore((state) => state.userId);
  const userName = useUserStore((state) => state.userName);
  const createTransaction = useCreateTransaction();

  const handleSubmit = async (data: TransactionFormResult) => {
    if (!userId) {
      toast.error('Пользователь не авторизован');
      return;
    }

    try {
      await createTransaction.mutateAsync({
        ...data,
        merchant: data.merchant ?? undefined,
        userId,
        userName: userName || undefined,
      });

      toast.success('Транзакция добавлена');

      // Closes the way «Назад» does: back to the screen that opened the form, never to the form again
      (onSuccess ?? closeScreen)();
    } catch (error) {
      toast.error('Не удалось добавить транзакцию');
      console.error('Failed to create transaction:', error);
    }
  };

  return (
    <div className="container max-w-2xl py-2">
      {showHeader && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Добавить транзакцию</h1>
          <p className="text-muted-foreground">Запишите новый доход или расход</p>
        </div>
      )}

      <TransactionForm onSubmit={handleSubmit} isLoading={createTransaction.isPending} />
    </div>
  );
}

// Re-export components and types
export { TransactionForm, type TransactionFormResult } from './ui/TransactionForm';
export { addTransactionSchema, type AddTransactionFormData } from './model/schema';
