import { useState } from 'react';
import { useDeleteTransaction } from '@/entities/transaction';
import { useUserStore } from '@/entities/user/model/store';
import { DeleteConfirmation } from './ui/DeleteConfirmation';
import { toast } from 'sonner';

interface UseDeleteTransactionDialogProps {
  onSuccess?: () => void;
}

/**
 * Hook to manage delete transaction dialog
 */
export function useDeleteTransactionDialog({ onSuccess }: UseDeleteTransactionDialogProps = {}) {
  const [open, setOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<{
    id: string;
    description?: string;
  } | null>(null);

  const userId = useUserStore((state) => state.userId);
  const deleteTransaction = useDeleteTransaction();

  const openDialog = (id: string, description?: string) => {
    setTransactionToDelete({ id, description });
    setOpen(true);
  };

  const handleConfirm = async () => {
    if (!transactionToDelete || !userId) return;

    try {
      await deleteTransaction.mutateAsync({ id: transactionToDelete.id, userId });
      toast.success('Транзакция удалена');
      setOpen(false);
      setTransactionToDelete(null);
      onSuccess?.();
    } catch (error) {
      toast.error('Не удалось удалить транзакцию');
      console.error('Failed to delete transaction:', error);
    }
  };

  return {
    openDialog,
    DialogComponent: (
      <DeleteConfirmation
        open={open}
        onOpenChange={setOpen}
        onConfirm={handleConfirm}
        isLoading={deleteTransaction.isPending}
        transactionDescription={transactionToDelete?.description}
      />
    ),
  };
}

// Re-export component
export { DeleteConfirmation } from './ui/DeleteConfirmation';
