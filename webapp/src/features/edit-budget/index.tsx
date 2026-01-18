import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBudget, useUpdateBudget, useDeleteBudget } from '@/entities/budget';
import { BudgetForm } from '../create-budget/ui/BudgetForm';
import type { CreateBudgetFormData } from '../create-budget/model/schema';
import { ROUTES } from '@/shared/lib/constants';
import { toast } from 'sonner';
import { Skeleton } from '@/shared/ui/skeleton';
import { Button } from '@/shared/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/ui/alert-dialog';
import { Trash2 } from 'lucide-react';

/**
 * EditBudget feature
 * Reuses BudgetForm from CreateBudget
 */
export function EditBudget() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: budget, isLoading } = useBudget(id || null);
  const updateBudget = useUpdateBudget();
  const deleteBudget = useDeleteBudget();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleSubmit = async (data: CreateBudgetFormData) => {
    if (!id) return;

    try {
      await updateBudget.mutateAsync({
        id,
        data: {
          name: data.name,
          amount: data.amount,
          period: data.period,
          startDate: data.startDate,
          endDate: data.endDate,
          categoryIds: data.categoryIds,
          description: data.description,
        },
      });

      toast.success('Бюджет обновлен');
      navigate(ROUTES.BUDGETS);
    } catch (error) {
      toast.error('Не удалось обновить бюджет');
      console.error('Failed to update budget:', error);
    }
  };

  const handleDelete = async () => {
    if (!id || !budget) return;

    try {
      await deleteBudget.mutateAsync({ id, userId: budget.userId });
      toast.success('Бюджет удален');
      navigate(ROUTES.BUDGETS);
    } catch (error) {
      toast.error('Не удалось удалить бюджет');
      console.error('Failed to delete budget:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="container max-w-2xl py-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!budget) {
    return (
      <div className="container max-w-2xl py-6">
        <p className="text-muted-foreground">Бюджет не найден</p>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Редактировать бюджет</h1>
          <p className="text-muted-foreground">Измените параметры бюджета</p>
        </div>
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="icon">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить бюджет?</AlertDialogTitle>
              <AlertDialogDescription>
                Это действие нельзя отменить. Бюджет «{budget.name}» будет удален навсегда.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteBudget.isPending ? 'Удаление...' : 'Удалить'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <BudgetForm
        onSubmit={handleSubmit}
        isLoading={updateBudget.isPending}
        submitButtonText="Сохранить изменения"
        defaultValues={{
          name: budget.name,
          amount: budget.amount,
          period: budget.period,
          startDate: budget.startDate,
          endDate: budget.endDate,
          categoryIds: budget.categoryIds,
          description: budget.description,
        }}
      />
    </div>
  );
}
