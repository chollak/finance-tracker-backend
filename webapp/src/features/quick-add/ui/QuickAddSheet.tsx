import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/ui/sheet';
import { useCreateTransaction } from '@/entities/transaction';
import { useUserStore } from '@/entities/user/model/store';
import { toast } from 'sonner';

import { QuickAddForm } from './QuickAddForm';
import type { QuickAddFormData } from '../model/schema';

interface QuickAddSheetProps {
  children: React.ReactNode;
  defaultType?: 'income' | 'expense';
  onSuccess?: () => void;
}

/**
 * Quick Add Sheet - Bottom sheet modal for fast transaction entry
 */
export function QuickAddSheet({
  children,
  defaultType = 'expense',
  onSuccess,
}: QuickAddSheetProps) {
  const [open, setOpen] = useState(false);
  const userId = useUserStore((state) => state.userId);
  const userName = useUserStore((state) => state.userName);
  const createTransaction = useCreateTransaction();

  const handleSubmit = async (data: QuickAddFormData) => {
    if (!userId) {
      toast.error('Пользователь не авторизован');
      return;
    }

    try {
      await createTransaction.mutateAsync({
        ...data,
        description: data.description || data.category, // Fallback to category name
        userId,
        userName: userName || undefined,
      });

      toast.success('Транзакция добавлена');
      setOpen(false);
      onSuccess?.();
    } catch (error) {
      toast.error('Не удалось добавить транзакцию');
      console.error('Failed to create transaction:', error);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side="bottom"
        className="h-[85vh] rounded-t-3xl pb-safe"
      >
        <SheetHeader className="pb-4">
          <SheetTitle className="text-center">Быстрое добавление</SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto h-full pb-8">
          <QuickAddForm
            onSubmit={handleSubmit}
            isLoading={createTransaction.isPending}
            defaultType={defaultType}
            onClose={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Controlled version of QuickAddSheet
 * Use when you need external control over open state
 */
interface ControlledQuickAddSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: 'income' | 'expense';
  onSuccess?: () => void;
}

export function ControlledQuickAddSheet({
  open,
  onOpenChange,
  defaultType = 'expense',
  onSuccess,
}: ControlledQuickAddSheetProps) {
  const userId = useUserStore((state) => state.userId);
  const userName = useUserStore((state) => state.userName);
  const createTransaction = useCreateTransaction();

  const handleSubmit = async (data: QuickAddFormData) => {
    if (!userId) {
      toast.error('Пользователь не авторизован');
      return;
    }

    try {
      await createTransaction.mutateAsync({
        ...data,
        description: data.description || data.category,
        userId,
        userName: userName || undefined,
      });

      toast.success('Транзакция добавлена');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error('Не удалось добавить транзакцию');
      console.error('Failed to create transaction:', error);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[85vh] rounded-t-3xl pb-safe"
      >
        <SheetHeader className="pb-4">
          <SheetTitle className="text-center">Быстрое добавление</SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto h-full pb-8">
          <QuickAddForm
            onSubmit={handleSubmit}
            isLoading={createTransaction.isPending}
            defaultType={defaultType}
            onClose={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
