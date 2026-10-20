import { useQueryClient } from '@tanstack/react-query';
import { deleteTransaction, useCreateTransaction } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { toLocalDate } from '@/shared/lib/dates';
import { showUndoToast } from '@/shared/lib/undo';
import { WRITE_FAILED } from '../model/captureNotices';
import { quickChipSavedDetail, type QuickChip } from '../model/quickChips';

/**
 * A tap on a quick chip (FT-114, Composer.md): the expense is written at once — today, the chip's category,
 * note, amount and account — and Home says «Записано» with «Отменить», which really deletes it.
 */
export function useQuickChip() {
  const queryClient = useQueryClient();
  const create = useCreateTransaction();
  const userId = useUserStore((state) => state.userId);
  const userName = useUserStore((state) => state.userName);

  const write = async ({ record }: QuickChip) => {
    if (!userId) return;

    let id: string | undefined;
    try {
      const saved = await create.mutateAsync({
        type: 'expense',
        amount: record.amountMinor / 100,
        amountMinor: record.amountMinor,
        currency: record.currency,
        accountId: record.accountId,
        categoryId: record.categoryId,
        category: record.categoryName,
        description: record.note,
        date: toLocalDate(new Date()),
        userId,
        userName: userName || undefined,
        // Every tap is a record of its own; the id only keeps a resent request from writing it twice
        clientId: crypto.randomUUID(),
      });
      id = saved.id;
    } catch {
      showUndoToast({ kind: 'info', title: WRITE_FAILED.title, detail: WRITE_FAILED.detail });
      return;
    }

    const written = id;
    showUndoToast({
      kind: 'saved',
      title: 'Записано',
      detail: quickChipSavedDetail(record),
      ...(written ? { undo: () => deleteTransaction(queryClient, { id: written, userId }) } : {}),
    });
  };

  return { write, isPending: create.isPending };
}
