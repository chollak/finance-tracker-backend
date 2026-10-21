import { useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { deleteTransaction, useCreateTransaction, writeOnDevice, type QueuedRecordInput } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { useShowHomeAfterSave } from '@/shared/lib/navigation';
import { connectionLost, isNoConnectionError, isOffline } from '@/shared/lib/offline';
import { announceSaved } from '../model/announceSaved';
import type { ManualEntryRecord } from '../model/manualEntry';

/** The entry as the outbox keeps it (FT-129). */
function queuedRecord(record: ManualEntryRecord): QueuedRecordInput {
  return {
    type: record.type,
    amountMinor: record.amountMinor,
    currency: record.currency,
    ...(record.accountId ? { accountId: record.accountId } : {}),
    categoryId: record.categoryId,
    categoryName: record.categoryName,
    date: record.date,
    note: record.note,
  };
}

/**
 * Writes a manual entry (FT-113): `POST /api/transactions` with the amount in minor units, the account,
 * its currency, the category and the date, then shows Home with
 * «Записано» and «Отменить». A failed save keeps the screen as it was, so it can be pressed again.
 *
 * Without a connection (FT-129, board «Ручной ввод без связи») the entry is written on the device — into the outbox
 * with its client id — and Home says it will be sent with the connection. A send that got no answer at all ends there
 * too, with the client id it was sent with.
 */
export function useSaveManualEntry() {
  const queryClient = useQueryClient();
  const create = useCreateTransaction();
  const userId = useUserStore((state) => state.userId);
  const userName = useUserStore((state) => state.userName);
  const showHome = useShowHomeAfterSave();
  // One client id per record as entered (FT-106): pressing again after a lost answer returns the record
  // the server already has instead of writing a second one; a changed record is a new one.
  const attempt = useRef<{ key: string; clientId: string } | null>(null);

  const save = async (record: ManualEntryRecord, accountName: string | undefined) => {
    if (!userId || create.isPending) return;
    const key = JSON.stringify(record);
    if (attempt.current?.key !== key) attempt.current = { key, clientId: crypto.randomUUID() };
    const clientId = attempt.current.clientId;

    if (isOffline()) {
      writeOnDevice(queryClient, userId, [queuedRecord(record)], [clientId]);
      attempt.current = null;
      showHome();
      return;
    }

    let id: string | undefined;
    try {
      const saved = await create.mutateAsync({
        type: record.type,
        amount: record.amountMinor / 100,
        amountMinor: record.amountMinor,
        currency: record.currency,
        accountId: record.accountId,
        categoryId: record.categoryId,
        category: record.categoryName,
        date: record.date,
        description: record.note,
        userId,
        userName: userName || undefined,
        clientId,
      });
      id = saved.id;
    } catch (error) {
      if (isNoConnectionError(error)) {
        connectionLost();
        writeOnDevice(queryClient, userId, [queuedRecord(record)], [clientId]);
        attempt.current = null;
        showHome();
      }
      return; // Otherwise the screen says so from the mutation's error state
    }

    if (id) {
      announceSaved({ id, record, accountName, remove: (recordId) => deleteTransaction(queryClient, { id: recordId, userId }) });
    }
    showHome();
  };

  return { save, isPending: create.isPending, failed: create.isError };
}
