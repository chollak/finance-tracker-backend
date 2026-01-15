import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';

interface DeleteConfirmationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
  transactionDescription?: string;
}

/**
 * Delete confirmation modal
 * Uses AlertDialog from shadcn
 */
export function DeleteConfirmation({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
  transactionDescription,
}: DeleteConfirmationProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить транзакцию?</AlertDialogTitle>
          <AlertDialogDescription>
            {transactionDescription ? (
              <>
                Вы уверены, что хотите удалить транзакцию <strong>"{transactionDescription}"</strong>?
                Это действие нельзя отменить.
              </>
            ) : (
              'Вы уверены, что хотите удалить эту транзакцию? Это действие нельзя отменить.'
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isLoading}>
            {isLoading ? 'Удаление...' : 'Удалить'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
