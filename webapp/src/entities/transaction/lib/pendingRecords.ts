import type { Transaction } from '@/shared/types';
import { formatMinor } from '@/shared/lib/money';
import { pluralRu } from '@/shared/lib/plural';
import type { QueuedRecord, QueuedRecordInput } from '../model/outbox';

/** A record of a list; one written without a connection carries `pending` until it is sent (FT-129). */
export type ListedRecord = Transaction & {
  pending?: {
    /** The device read «45» as 45 000: the row asks to check the amount. */
    checkAmount: boolean;
  };
};

/** A waiting record as the lists show it: its client id is its id until the server gives it one. */
export function pendingRecord(queued: QueuedRecord): ListedRecord {
  return {
    id: queued.clientId,
    date: queued.date,
    category: queued.categoryName,
    categoryId: queued.categoryId,
    description: queued.note,
    amount: queued.amountMinor / 100,
    amountMinor: queued.amountMinor,
    currency: queued.currency,
    accountId: queued.accountId,
    type: queued.type,
    userId: queued.userId,
    createdAt: new Date(queued.createdAt).toISOString(),
    pending: { checkAmount: queued.checkAmount === true },
  };
}

const day = (record: Transaction) => record.date.slice(0, 10);

/**
 * The recent records with the ones waiting for the connection (board «Главная без связи»): by day, newest first, a
 * waiting record first on its day — it was written after everything the server has. Undefined while nothing is read
 * and nothing waits.
 */
export function withPendingRecords(
  records: readonly Transaction[] | undefined,
  pending: readonly ListedRecord[],
  limit: number
): ListedRecord[] | undefined {
  if (!records && pending.length === 0) return undefined;
  const waiting = [...pending].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const merged: ListedRecord[] = [...waiting, ...(records ?? [])];
  // Stable: within a day the waiting ones stay first and the server's keep their order
  merged.sort((a, b) => day(b).localeCompare(day(a)));
  return merged.slice(0, limit);
}

/** «Записано на этом устройстве» (OfflineBar.md). */
export const QUEUED_TITLE = 'Записано на этом устройстве';

function recordName(record: QueuedRecordInput): string {
  const name = record.note || record.categoryName;
  return record.checkAmount ? `${name} · проверьте сумму` : name;
}

function signedAmount(record: QueuedRecordInput): string {
  const signed = record.type === 'expense' ? -record.amountMinor : record.amountMinor;
  return formatMinor(signed, record.currency, { sign: 'always' });
}

/**
 * The second line of the toast (board «Главная без связи»): «Такси · −18 000 сум · отправится со связью»; several —
 * «2 записи · отправятся со связью».
 */
export function queuedToastDetail(records: readonly QueuedRecordInput[]): string {
  if (records.length === 1) return `${recordName(records[0])} · ${signedAmount(records[0])} · отправится со связью`;
  return `${records.length} ${pluralRu(records.length, 'запись', 'записи', 'записей')} · отправятся со связью`;
}

/** A record the server refused when the outbox sent it: «Такси · −18 000 сум — запишите её снова». */
export function refusedToastDetail(record: QueuedRecordInput): string {
  return `${record.note || record.categoryName} · ${signedAmount(record)} — запишите её снова`;
}
