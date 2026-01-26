import { useNavigate, useParams } from 'react-router-dom';
import { useTransaction, useUpdateTransaction } from '@/entities/transaction';
import { TransactionForm } from '../add-transaction/ui/TransactionForm';
import type { AddTransactionFormData } from '../add-transaction/model/schema';
import { ROUTES } from '@/shared/lib/constants';
import { toast } from 'sonner';
import { Skeleton } from '@/shared/ui/skeleton';

/**
 * EditTransaction feature
 * Reuses TransactionForm from AddTransaction
 */
export function EditTransaction() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: transaction, isLoading } = useTransaction(id || null);
  const updateTransaction = useUpdateTransaction();

  const handleSubmit = async (data: AddTransactionFormData) => {
    if (!id || !transaction?.userId) return;

    try {
      await updateTransaction.mutateAsync({
        id,
        userId: transaction.userId,
        data: {
          amount: data.amount,
          category: data.category,
          description: data.description,
          date: data.date,
          type: data.type,
          merchant: data.merchant,
        },
      });

      toast.success('Транзакция обновлена');
      navigate(ROUTES.TRANSACTIONS);
    } catch (error) {
      toast.error('Не удалось обновить транзакцию');
      console.error('Failed to update transaction:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!transaction) {
    return (
      <div>
        <p className="text-muted-foreground">Транзакция не найдена</p>
      </div>
    );
  }

  return (
    <div>
      <TransactionForm
        onSubmit={handleSubmit}
        isLoading={updateTransaction.isPending}
        defaultValues={{
          amount: transaction.amount,
          type: transaction.type,
          category: transaction.category,
          description: transaction.description,
          date: transaction.date,
          merchant: transaction.merchant,
        }}
      />
    </div>
  );
}
