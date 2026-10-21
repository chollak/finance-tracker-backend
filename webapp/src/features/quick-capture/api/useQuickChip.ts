import { useQueryClient } from '@tanstack/react-query';
import { deleteTransaction, useCreateTransaction, writeOnDevice, type QueuedRecordInput } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { toLocalDate } from '@/shared/lib/dates';
import { connectionLost, isNoConnectionError, isOffline } from '@/shared/lib/offline';
import { showUndoToast } from '@/shared/lib/undo';
import { WRITE_FAILED } from '../model/captureNotices';
import { quickChipSavedDetail, type QuickChip, type QuickChipRecord } from '../model/quickChips';

/** What a chip writes, as the outbox keeps it (FT-129). */
function chipRecord(record: QuickChipRecord, date: string): QueuedRecordInput {
  return {
    type: 'expense',
    amountMinor: record.amountMinor,
    currency: record.currency,
    ...(record.accountId ? { accountId: record.accountId } : {}),
    categoryId: record.categoryId,
    categoryName: record.categoryName,
    date,
    note: record.note,
  };
}

/**
 * A tap on a quick chip (FT-114, Composer.md): the expense is written at once — today, the chip's category,
 * note, amount and account — and Home says «Записано» with «Отменить», which really deletes it.
 *
 * Without a connection (FT-129, OfflineBar.md) it is written on the device: into the outbox with its client id, and
 * the toast says it will be sent with the connection. A send that gets no answer at all ends there too, with the same
 * client id, so the server keeps one record even if the send did reach it.
 */
export function useQuickChip() {
  const queryClient = useQueryClient();
  const create = useCreateTransaction();
  const userId = useUserStore((state) => state.userId);
  const userName = useUserStore((state) => state.userName);

  const write = async ({ record }: QuickChip) => {
    if (!userId) return;
    // Every tap is a record of its own; the id only keeps a resent request from writing it twice
    const clientId = crypto.randomUUID();
    const date = toLocalDate(new Date());

    if (isOffline()) {
      writeOnDevice(queryClient, userId, [chipRecord(record, date)], [clientId]);
      return;
    }

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
        date,
        userId,
        userName: userName || undefined,
        clientId,
      });
      id = saved.id;
    } catch (error) {
      if (isNoConnectionError(error)) {
        connectionLost();
        writeOnDevice(queryClient, userId, [chipRecord(record, date)], [clientId]);
        return;
      }
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
