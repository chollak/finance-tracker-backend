import { useMemo } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useUserStore } from '@/entities/user';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import {
  addToOutbox,
  connectionLost,
  isNoConnectionError,
  outboxOf,
  removeFromOutbox,
  useOutboxStore,
  type OutboxRow,
} from '@/shared/lib/offline';
import { showUndoToast } from '@/shared/lib/undo';
import type { Transaction } from '@/shared/types';
import type { QueuedRecord, QueuedRecordInput } from '../model/outbox';
import { pendingRecord, QUEUED_TITLE, queuedToastDetail, refusedToastDetail, type ListedRecord } from '../lib/pendingRecords';
import { transactionKeys } from './keys';
import { deleteTransaction, refreshAfterRecordsChanged } from './mutations';

/**
 * The outbox of records (FT-129, OfflineBar.md): what a quick chip, the manual entry or a phrase read on the device
 * wrote without a connection waits here with its client id (FT-106) and goes to `POST /api/transactions` when the
 * connection is back, oldest first. The server answers a repeated client id with the record it already has, so a send
 * whose answer was lost, sent again, makes no second record.
 */

/** How long one send may wait for the server before it counts as unanswered. */
export const OUTBOX_SEND_TIMEOUT_MS = 15_000;

const toQueued = (row: OutboxRow): QueuedRecord => ({
  ...(row.body as QueuedRecordInput),
  clientId: row.clientId,
  userId: row.userId,
  createdAt: row.createdAt,
});

/** What waits for this user, oldest first. */
export function pendingRecordsOf(userId: string): QueuedRecord[] {
  return outboxOf(userId).map(toQueued);
}

/** The waiting records of the signed-in user as the lists show them, with «Ждёт связи». */
export function usePendingRecords(): ListedRecord[] {
  const userId = useUserStore((state) => state.userId);
  const entries = useOutboxStore((state) => state.entries);
  return useMemo(() => (userId ? outboxOf(userId, entries).map((row) => pendingRecord(toQueued(row))) : []), [userId, entries]);
}

/**
 * Puts records into the outbox, each with a client id of its own — or the one an earlier send of it already used, so
 * the server keeps one record even if that send did reach it.
 */
export function queueRecords(userId: string, records: readonly QueuedRecordInput[], clientIds: readonly string[] = []): QueuedRecord[] {
  const now = Date.now();
  const rows: OutboxRow<QueuedRecordInput>[] = records.map((record, index) => ({
    clientId: clientIds[index] ?? crypto.randomUUID(),
    userId,
    // Apart by a millisecond, so they are sent in the order they were written
    createdAt: now + index,
    body: { ...record },
  }));
  void addToOutbox(rows).catch(() => undefined);
  return rows.map(toQueued);
}

/**
 * Writes records on the device and says so: «Записано на этом устройстве · Такси · −18 000 сум · отправится со
 * связью», and «Отменить» takes them back — out of the outbox, or off the server if they were sent meanwhile.
 */
export function writeOnDevice(
  queryClient: QueryClient,
  userId: string,
  records: readonly QueuedRecordInput[],
  clientIds?: readonly string[]
): QueuedRecord[] {
  const queued = queueRecords(userId, records, clientIds);
  showUndoToast({
    kind: 'saved',
    title: QUEUED_TITLE,
    detail: queuedToastDetail(queued),
    undo: () => cancelQueuedRecords(queryClient, { clientIds: queued.map((record) => record.clientId), userId }),
  });
  return queued;
}

/** Records being sent right now, those taken back while they were, and the server's ids of those already sent. */
const sending = new Set<string>();
const cancelled = new Set<string>();
const sentIds = new Map<string, string>();

/** Takes waiting records back: out of the outbox; one already sent is deleted on the server (FT-105, soft). */
export async function cancelQueuedRecords(
  queryClient: QueryClient,
  { clientIds, userId }: { clientIds: readonly string[]; userId: string }
): Promise<void> {
  const unsent: string[] = [];
  for (const clientId of clientIds) {
    const id = sentIds.get(clientId);
    if (id) {
      await deleteTransaction(queryClient, { id, userId });
      sentIds.delete(clientId);
    } else if (sending.has(clientId)) {
      cancelled.add(clientId);
    } else {
      unsent.push(clientId);
    }
  }
  if (unsent.length) await removeFromOutbox(unsent);
}

function sendBody(record: QueuedRecord) {
  return {
    type: record.type,
    amount: record.amountMinor / 100,
    amountMinor: record.amountMinor,
    currency: record.currency,
    ...(record.accountId ? { accountId: record.accountId } : {}),
    ...(record.categoryId ? { categoryId: record.categoryId } : {}),
    category: record.categoryName,
    description: record.note,
    date: record.date,
    userId: record.userId,
    clientId: record.clientId,
  };
}

/** The sent record among the recent ones at once, so it does not blink out while they are read again. */
function showSent(queryClient: QueryClient, record: QueuedRecord, id: string): void {
  const sent: Transaction = {
    id,
    date: record.date,
    category: record.categoryName,
    categoryId: record.categoryId,
    description: record.note,
    amount: record.amountMinor / 100,
    amountMinor: record.amountMinor,
    currency: record.currency,
    accountId: record.accountId,
    type: record.type,
    userId: record.userId,
    createdAt: new Date().toISOString(),
  };
  queryClient.setQueriesData<Transaction[]>({ queryKey: transactionKeys.recent(record.userId) }, (old) =>
    Array.isArray(old) ? [sent, ...old.filter((item) => item.id !== id)] : old
  );
}

/** The server will take it later: no answer, the session (FT-128), too many requests, or the server itself is down. */
function worthRetrying(error: unknown): boolean {
  if (isNoConnectionError(error)) return true;
  const status = (error as { statusCode?: number } | null)?.statusCode;
  return status === undefined || status === 401 || status === 408 || status === 429 || status >= 500;
}

export interface OutboxFlush {
  sent: number;
  /** Why it stopped before the end; null when everything went. */
  stopped: 'no-connection' | 'server' | null;
}

let running: Promise<OutboxFlush> | null = null;

async function flush(queryClient: QueryClient, userId: string): Promise<OutboxFlush> {
  let sent = 0;
  let stopped: OutboxFlush['stopped'] = null;

  for (const record of pendingRecordsOf(userId)) {
    sending.add(record.clientId);
    try {
      const response = await apiClient.post<{ id: string }>(API_ENDPOINTS.TRANSACTIONS.CREATE, sendBody(record), {
        timeoutMs: OUTBOX_SEND_TIMEOUT_MS,
      });
      const id = response.data?.id;
      sent += 1;
      if (id) {
        sentIds.set(record.clientId, id);
        if (cancelled.has(record.clientId)) {
          cancelled.delete(record.clientId);
          await deleteTransaction(queryClient, { id, userId }).catch(() => undefined);
          sentIds.delete(record.clientId);
        } else {
          showSent(queryClient, record, id);
        }
      }
      await removeFromOutbox([record.clientId]);
    } catch (error) {
      if (worthRetrying(error)) {
        if (isNoConnectionError(error)) connectionLost();
        stopped = isNoConnectionError(error) ? 'no-connection' : 'server';
        break;
      }
      // The server will never take it (a record it finds invalid, the free limit): say so instead of trying forever
      await removeFromOutbox([record.clientId]);
      cancelled.delete(record.clientId);
      showUndoToast({ kind: 'info', title: 'Запись не отправилась', detail: refusedToastDetail(record) });
    } finally {
      sending.delete(record.clientId);
    }
  }

  if (sent > 0) refreshAfterRecordsChanged(queryClient, userId);
  return { sent, stopped };
}

/** Sends what waits. Two calls at once share one run, so no record is posted twice by this device. */
export function flushRecordOutbox(queryClient: QueryClient, userId: string): Promise<OutboxFlush> {
  if (!running) {
    running = flush(queryClient, userId).finally(() => {
      running = null;
    });
  }
  return running;
}
