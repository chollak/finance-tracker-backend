import { useMemo } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useUserStore } from '@/entities/user';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import {
  addToOutbox,
  cancelInOutbox,
  connectionLost,
  isNoConnectionError,
  outboxOf,
  outboxRow,
  removeFromOutbox,
  shownOutboxOf,
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

/** What the device keeps of a record: what was written and when its phrase was (absent in rows kept before it was). */
type QueuedBody = QueuedRecordInput & { writtenAt?: number };

function toQueued(row: OutboxRow): QueuedRecord {
  const { writtenAt, ...record } = row.body as QueuedBody;
  return { ...record, clientId: row.clientId, userId: row.userId, createdAt: row.createdAt, writtenAt: writtenAt ?? row.createdAt };
}

/** What waits for this user, oldest first; not what was taken back while it was being sent. */
export function pendingRecordsOf(userId: string): QueuedRecord[] {
  return shownOutboxOf(userId).map(toQueued);
}

/** The waiting records of the signed-in user as the lists show them, with «Ждёт связи». */
export function usePendingRecords(): ListedRecord[] {
  const userId = useUserStore((state) => state.userId);
  const entries = useOutboxStore((state) => state.entries);
  return useMemo(
    () => (userId ? shownOutboxOf(userId, entries).map((row) => pendingRecord(toQueued(row))) : []),
    [userId, entries]
  );
}

/**
 * Puts records into the outbox, each with a client id of its own — or the one an earlier send of it already used, so
 * the server keeps one record even if that send did reach it.
 */
export function queueRecords(userId: string, records: readonly QueuedRecordInput[], clientIds: readonly string[] = []): QueuedRecord[] {
  const now = Date.now();
  const rows: OutboxRow<QueuedBody>[] = records.map((record, index) => ({
    clientId: clientIds[index] ?? crypto.randomUUID(),
    userId,
    // Apart by a millisecond, so they are sent in the order they were written
    createdAt: now + index,
    // The same for every record of one phrase: the lists keep them in the order they were written
    body: { ...record, writtenAt: now },
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

/** Records being sent right now, and the server's ids of those this device sent in this session. */
const sending = new Set<string>();
const sentIds = new Map<string, string>();

/**
 * Takes waiting records back, gone from the screens at once:
 * - one not sent yet leaves the outbox;
 * - one being sent right now stays on the device as taken back (`cancelled`, so a reload does not bring it back) until
 *   its send is settled: deleted on the server if it got there, sent again with its client id and deleted if the send
 *   got no answer;
 * - one already sent is deleted on the server (FT-105, soft).
 */
export async function cancelQueuedRecords(
  queryClient: QueryClient,
  { clientIds, userId }: { clientIds: readonly string[]; userId: string }
): Promise<void> {
  const sent = clientIds.flatMap((clientId) => {
    const id = sentIds.get(clientId);
    return id ? [{ clientId, id }] : [];
  });
  const inFlight = clientIds.filter((clientId) => !sentIds.has(clientId) && sending.has(clientId));
  const unsent = clientIds.filter((clientId) => !sentIds.has(clientId) && !sending.has(clientId));
  const outbox = Promise.all([
    inFlight.length ? cancelInOutbox(inFlight) : undefined,
    unsent.length ? removeFromOutbox(unsent) : undefined,
  ]);
  for (const { clientId, id } of sent) {
    await deleteTransaction(queryClient, { id, userId });
    sentIds.delete(clientId);
  }
  await outbox;
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

const statusOf = (error: unknown) => (error as { statusCode?: number } | null)?.statusCode;

/** The server will take it later: no answer, the session (FT-128), too many requests, or the server itself is down. */
function worthRetrying(error: unknown): boolean {
  if (isNoConnectionError(error)) return true;
  const status = statusOf(error);
  return status === undefined || status === 401 || status === 408 || status === 429 || status >= 500;
}

/** «Отменить» came while it was being sent — in this session or before the app was opened again. */
const takenBack = (clientId: string) => outboxRow(clientId)?.cancelled === true;

/** Deletes on the server a record that was taken back; «not found» means it is gone already. */
async function deleteTakenBack(queryClient: QueryClient, id: string, userId: string): Promise<void> {
  try {
    await deleteTransaction(queryClient, { id, userId });
  } catch (error) {
    if (statusOf(error) !== 404) throw error;
  }
}

/** What `POST /api/transactions` answers: a repeat of a client id brings the record it has, deleted or not (FT-106). */
interface SendAnswer {
  id: string;
  transaction?: { deletedAt?: string };
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

  for (const row of outboxOf(userId)) {
    // Taken back while an earlier one was being sent: it never goes
    if (!outboxRow(row.clientId)) continue;
    const record = toQueued(row);
    sending.add(record.clientId);
    try {
      const response = await apiClient.post<SendAnswer>(API_ENDPOINTS.TRANSACTIONS.CREATE, sendBody(record), {
        timeoutMs: OUTBOX_SEND_TIMEOUT_MS,
      });
      const id = response.data?.id;
      if (takenBack(record.clientId)) {
        // The server must not keep it; a failed delete leaves it taken back for the next send
        if (id && !response.data?.transaction?.deletedAt) await deleteTakenBack(queryClient, id, userId);
      } else {
        sent += 1;
        if (id) {
          sentIds.set(record.clientId, id);
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
      // The server will never take it (a record it finds invalid, the free limit): say so instead of trying forever —
      // unless it was taken back
      const quiet = takenBack(record.clientId);
      await removeFromOutbox([record.clientId]);
      if (!quiet) showUndoToast({ kind: 'info', title: 'Запись не отправилась', detail: refusedToastDetail(record) });
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
