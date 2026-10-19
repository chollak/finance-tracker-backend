import { useCreateBudget } from '@/entities/budget';
import { useUserStore } from '@/entities/user/model/store';
import { BudgetForm } from './ui/BudgetForm';
import { useCloseScreen } from '@/shared/lib/navigation';
import type { CreateBudgetFormData } from './model/schema';
import { toast } from 'sonner';

interface CreateBudgetProps {
  onSuccess?: () => void;
}

/**
 * CreateBudget feature
 * Handles budget creation logic and navigation
 */
export function CreateBudget({ onSuccess }: CreateBudgetProps = {}) {
  const closeScreen = useCloseScreen();
  const userId = useUserStore((state) => state.userId);
  const createBudget = useCreateBudget();

  const handleSubmit = async (data: CreateBudgetFormData) => {
    if (!userId) {
      toast.error('Пользователь не авторизован');
      return;
    }

    try {
      await createBudget.mutateAsync({
        ...data,
        userId,
      });

      toast.success('Бюджет создан');

      // Closes the way «Назад» does: back to the screen that opened the form, never to the form again
      (onSuccess ?? closeScreen)();
    } catch (error) {
      toast.error('Не удалось создать бюджет');
      console.error('Failed to create budget:', error);
    }
  };

  return (
    <div className="container max-w-2xl py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Создать бюджет</h1>
        <p className="text-muted-foreground">Установите лимит расходов на период</p>
      </div>

      <BudgetForm onSubmit={handleSubmit} isLoading={createBudget.isPending} />
    </div>
  );
}

// Re-export components and types
export { BudgetForm } from './ui/BudgetForm';
export { createBudgetSchema, type CreateBudgetFormData } from './model/schema';
