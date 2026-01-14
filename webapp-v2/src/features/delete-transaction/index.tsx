import { useState } from 'react';
import { useDeleteTransaction } from '@/entities/transaction';
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

  const deleteTransaction = useDeleteTransaction();

  const openDialog = (id: string, description?: string) => {
    setTransactionToDelete({ id, description });
    setOpen(true);
  };

  const handleConfirm = async () => {
    if (!transactionToDelete) return;

    try {
      await deleteTransaction.mutateAsync(transactionToDelete.id);
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
