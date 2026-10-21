import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import {
  loadOutbox,
  memoryOfflineStorage,
  outboxOf,
  setOfflineStorage,
  useConnectivityStore,
  useOutboxStore,
  type OfflineStorage,
} from '@/shared/lib/offline';
import { MINUS, NBSP } from '@/shared/lib/money';
import { useUndoToastStore, visibleEntry } from '@/shared/lib/undo';
import { useUserStore } from '@/entities/user';
import { transactionKeys } from './keys';
import {
  cancelQueuedRecords,
  flushRecordOutbox,
  pendingRecordsOf,
  queueRecords,
  writeOnDevice,
} from './recordOutbox';
import type { QueuedRecordInput } from '../model/outbox';

/**
 * FT-129: records written without a connection — by a quick chip, by hand, by a simple phrase — wait in the outbox with
 * their client id (FT-106) and go to `POST /api/transactions` when the connection is back. The server answers a repeat
 * of a client id with the record it already has, so a send whose answer was lost and is sent again makes no second
 * record.
 */

vi.mock('@/shared/api/client', () => ({ apiClient: { post: vi.fn(), delete: vi.fn(), get: vi.fn() } }));

const USER = '900000001';

const TAXI: QueuedRecordInput = {
  type: 'expense',
  amountMinor: 1_800_000,
  currency: 'UZS',
  accountId: 'card',
  categoryId: 'c-tr',
  categoryName: 'Транспорт',
  date: '2026-10-14',
  note: 'Такси',
};
const COFFEE: QueuedRecordInput = { ...TAXI, amountMinor: 2_500_000, categoryId: 'c-cafe', categoryName: 'Кафе', note: 'Кофе' };

let queryClient: QueryClient;
let storage: OfflineStorage;

const posts = () => vi.mocked(apiClient.post).mock.calls;
const sentClientIds = () => posts().map(([, body]) => (body as { clientId: string }).clientId);
const shownToast = () => {
  const { stack, now } = useUndoToastStore.getState();
  return visibleEntry(stack, Math.max(now, Date.now()));
};

let next = 0;
beforeEach(() => {
  next = 0;
  storage = memoryOfflineStorage();
  setOfflineStorage(storage);
  useOutboxStore.setState({ entries: [] });
  useConnectivityStore.setState({ browserOnline: true, lost: false });
  useUndoToastStore.getState().clear();
  useUserStore.setState({ userId: USER, userType: 'telegram' });
  queryClient = new QueryClient();
  vi.mocked(apiClient.post).mockReset().mockImplementation(async () => ({ data: { id: `srv-${(next += 1)}` } }));
  vi.mocked(apiClient.delete).mockReset().mockResolvedValue({ data: null });
});

describe('a record written without a connection', () => {
  it('waits in the outbox with a client id of its own', () => {
    const [queued] = queueRecords(USER, [TAXI]);

    expect(queued.clientId).toMatch(/^[0-9a-f-]{36}$/);
    expect(pendingRecordsOf(USER)).toEqual([expect.objectContaining({ ...TAXI, clientId: queued.clientId })]);
  });

  it('keeps the client id an earlier attempt was sent with', () => {
    const [queued] = queueRecords(USER, [TAXI], ['kept-id']);

    expect(queued.clientId).toBe('kept-id');
  });

  it('is said with «Записано на этом устройстве» and «отправится со связью»', () => {
    writeOnDevice(queryClient, USER, [TAXI]);

    expect(shownToast()).toMatchObject({
      kind: 'saved',
      title: 'Записано на этом устройстве',
      detail: `Такси · ${MINUS}18${NBSP}000${NBSP}сум · отправится со связью`,
    });
  });

  it('several are said as one: «2 записи · отправятся со связью»', () => {
    writeOnDevice(queryClient, USER, [TAXI, COFFEE]);

    expect(shownToast()?.detail).toBe('2 записи · отправятся со связью');
  });

  it('asks to check an amount the device read as thousands', () => {
    writeOnDevice(queryClient, USER, [{ ...TAXI, note: 'Обед', amountMinor: 4_500_000, checkAmount: true }]);

    expect(shownToast()?.detail).toBe(`Обед · проверьте сумму · ${MINUS}45${NBSP}000${NBSP}сум · отправится со связью`);
  });

  it('«Отменить» takes it out of the outbox: nothing is sent', async () => {
    writeOnDevice(queryClient, USER, [TAXI]);

    await useUndoToastStore.getState().undoVisible();
    await flushRecordOutbox(queryClient, USER);

    expect(pendingRecordsOf(USER)).toEqual([]);
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});

describe('when the connection is back', () => {
  it('each record goes to POST /api/transactions with its client id, oldest first, and leaves the outbox', async () => {
    const [taxi] = queueRecords(USER, [TAXI]);
    const [coffee] = queueRecords(USER, [COFFEE]);

    await flushRecordOutbox(queryClient, USER);

    expect(posts().map(([endpoint]) => endpoint)).toEqual(['/transactions', '/transactions']);
    expect(posts()[0][1]).toEqual({
      type: 'expense',
      amount: 18_000,
      amountMinor: 1_800_000,
      currency: 'UZS',
      accountId: 'card',
      categoryId: 'c-tr',
      category: 'Транспорт',
      description: 'Такси',
      date: '2026-10-14',
      userId: USER,
      clientId: taxi.clientId,
    });
    expect(sentClientIds()).toEqual([taxi.clientId, coffee.clientId]);
    expect(pendingRecordsOf(USER)).toEqual([]);
  });

  it('a send that got no answer stays and goes again with the same client id — one record, not two', async () => {
    const [taxi] = queueRecords(USER, [TAXI]);
    vi.mocked(apiClient.post).mockRejectedValueOnce({ message: 'Network error', statusCode: 0 });

    await flushRecordOutbox(queryClient, USER);
    expect(pendingRecordsOf(USER)).toHaveLength(1);

    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { id: 'srv-1', repeated: true } });
    await flushRecordOutbox(queryClient, USER);

    expect(sentClientIds()).toEqual([taxi.clientId, taxi.clientId]);
    expect(pendingRecordsOf(USER)).toEqual([]);
  });

  it('a send that got no answer stops the rest and marks the connection lost', async () => {
    queueRecords(USER, [TAXI, COFFEE]);
    vi.mocked(apiClient.post).mockRejectedValueOnce({ message: 'Network error', statusCode: 0 });

    await flushRecordOutbox(queryClient, USER);

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(useConnectivityStore.getState().lost).toBe(true);
  });

  it('two sends at once post each record once', async () => {
    queueRecords(USER, [TAXI, COFFEE]);

    await Promise.all([flushRecordOutbox(queryClient, USER), flushRecordOutbox(queryClient, USER)]);

    expect(apiClient.post).toHaveBeenCalledTimes(2);
  });

  it('a record the server refuses is dropped and the toast says so', async () => {
    queueRecords(USER, [TAXI]);
    vi.mocked(apiClient.post).mockRejectedValueOnce({ message: 'Validation failed', statusCode: 400 });

    await flushRecordOutbox(queryClient, USER);

    expect(pendingRecordsOf(USER)).toEqual([]);
    expect(shownToast()).toMatchObject({
      kind: 'info',
      title: 'Запись не отправилась',
      detail: `Такси · ${MINUS}18${NBSP}000${NBSP}сум — запишите её снова`,
    });
  });

  it('a server that is down keeps the records for the next try', async () => {
    queueRecords(USER, [TAXI]);
    vi.mocked(apiClient.post).mockRejectedValueOnce({ message: 'Internal', statusCode: 503 });

    await flushRecordOutbox(queryClient, USER);

    expect(pendingRecordsOf(USER)).toHaveLength(1);
  });

  it('the sent record shows among the recent ones at once, while they are read again', async () => {
    queryClient.setQueryData(transactionKeys.recent(USER, 5), []);
    queueRecords(USER, [TAXI]);

    await flushRecordOutbox(queryClient, USER);

    expect(queryClient.getQueryData(transactionKeys.recent(USER, 5))).toEqual([
      expect.objectContaining({ id: 'srv-1', amountMinor: 1_800_000, categoryId: 'c-tr', description: 'Такси' }),
    ]);
    expect(queryClient.getQueryState(transactionKeys.recent(USER, 5))?.isInvalidated).toBe(true);
  });

  it('«Отменить» after the record was sent deletes it on the server', async () => {
    const [taxi] = queueRecords(USER, [TAXI]);
    await flushRecordOutbox(queryClient, USER);

    await cancelQueuedRecords(queryClient, { clientIds: [taxi.clientId], userId: USER });

    expect(apiClient.delete).toHaveBeenCalledWith(`/transactions/srv-1?userId=${USER}`);
  });
});

/** A send the test answers when it wants: the POST waits until `answer` or `fail`. */
function heldSend() {
  let answer!: (id: string) => void;
  let fail!: (error: unknown) => void;
  vi.mocked(apiClient.post).mockImplementationOnce(
    () =>
      new Promise((resolve, reject) => {
        answer = (id) => resolve({ data: { id } });
        fail = reject;
      })
  );
  return { answer: (id: string) => answer(id), fail: (error: unknown) => fail(error) };
}

/** Lets the flush reach its POST. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('«Отменить» while the record is being sent', () => {
  it('hides it at once, before the send has an answer', async () => {
    const send = heldSend();
    const [taxi] = writeOnDevice(queryClient, USER, [TAXI]);
    const flushed = flushRecordOutbox(queryClient, USER);
    await settle();

    await useUndoToastStore.getState().undoVisible();

    expect(pendingRecordsOf(USER)).toEqual([]);
    send.answer('srv-1');
    await flushed;
    expect(sentClientIds()).toEqual([taxi.clientId]);
  });

  it('a send that went through is deleted on the server and leaves the outbox, never shown as sent', async () => {
    queryClient.setQueryData(transactionKeys.recent(USER, 5), []);
    const send = heldSend();
    writeOnDevice(queryClient, USER, [TAXI]);
    const flushed = flushRecordOutbox(queryClient, USER);
    await settle();
    await useUndoToastStore.getState().undoVisible();

    send.answer('srv-7');
    await flushed;

    expect(apiClient.delete).toHaveBeenCalledWith(`/transactions/srv-7?userId=${USER}`);
    expect(outboxOf(USER)).toEqual([]);
    expect(await storage.listOutbox(USER)).toEqual([]);
    expect(queryClient.getQueryData(transactionKeys.recent(USER, 5))).toEqual([]);
  });

  it('a send that got no answer stays on the device as taken back, hidden; the next send settles it on the server', async () => {
    const send = heldSend();
    const [taxi] = writeOnDevice(queryClient, USER, [TAXI]);
    const flushed = flushRecordOutbox(queryClient, USER);
    await settle();
    await useUndoToastStore.getState().undoVisible();

    send.fail({ message: 'Network error', statusCode: 0 });
    await flushed;

    expect(pendingRecordsOf(USER)).toEqual([]);
    expect(await storage.listOutbox(USER)).toEqual([expect.objectContaining({ clientId: taxi.clientId, cancelled: true })]);
    expect(apiClient.delete).not.toHaveBeenCalled();

    // The connection is back: sent again with the same client id — the server keeps one — and deleted there
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { id: 'srv-1', repeated: true } });
    await flushRecordOutbox(queryClient, USER);

    expect(sentClientIds()).toEqual([taxi.clientId, taxi.clientId]);
    expect(apiClient.delete).toHaveBeenCalledWith(`/transactions/srv-1?userId=${USER}`);
    expect(outboxOf(USER)).toEqual([]);
    expect(await storage.listOutbox(USER)).toEqual([]);
  });

  it('stays taken back after the app is opened again', async () => {
    const send = heldSend();
    writeOnDevice(queryClient, USER, [TAXI]);
    const flushed = flushRecordOutbox(queryClient, USER);
    await settle();
    await useUndoToastStore.getState().undoVisible();
    send.fail({ message: 'Timeout', statusCode: 0 });
    await flushed;

    // A new start: the screens know nothing yet, the device has the outbox
    useOutboxStore.setState({ entries: [] });
    await loadOutbox(USER);

    expect(pendingRecordsOf(USER)).toEqual([]);
    await flushRecordOutbox(queryClient, USER);
    expect(apiClient.delete).toHaveBeenCalledWith(`/transactions/srv-1?userId=${USER}`);
    expect(outboxOf(USER)).toEqual([]);
  });

  it('a server that is down keeps it taken back for the next try', async () => {
    const send = heldSend();
    writeOnDevice(queryClient, USER, [TAXI]);
    const flushed = flushRecordOutbox(queryClient, USER);
    await settle();
    await useUndoToastStore.getState().undoVisible();

    send.fail({ message: 'Bad gateway', statusCode: 502 });
    await flushed;

    expect(pendingRecordsOf(USER)).toEqual([]);
    expect(outboxOf(USER)).toEqual([expect.objectContaining({ cancelled: true })]);
  });

  it('is not deleted again when the server says it already is', async () => {
    const send = heldSend();
    writeOnDevice(queryClient, USER, [TAXI]);
    const flushed = flushRecordOutbox(queryClient, USER);
    await settle();
    await useUndoToastStore.getState().undoVisible();
    send.fail({ message: 'Network error', statusCode: 0 });
    await flushed;

    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { id: 'srv-1', repeated: true, transaction: { id: 'srv-1', deletedAt: '2026-10-21T10:00:00.000Z' } },
    });
    await flushRecordOutbox(queryClient, USER);

    expect(apiClient.delete).not.toHaveBeenCalled();
    expect(outboxOf(USER)).toEqual([]);
  });

  it('a delete the server answers «not found» counts as done', async () => {
    const send = heldSend();
    writeOnDevice(queryClient, USER, [TAXI]);
    const flushed = flushRecordOutbox(queryClient, USER);
    await settle();
    await useUndoToastStore.getState().undoVisible();
    vi.mocked(apiClient.delete).mockRejectedValueOnce({ message: 'Not found', statusCode: 404 });

    send.answer('srv-1');
    await flushed;

    expect(outboxOf(USER)).toEqual([]);
    expect(shownToast()?.title).not.toBe('Запись не отправилась');
  });

  it('a delete that got no answer keeps it taken back, and the next send deletes it', async () => {
    const send = heldSend();
    writeOnDevice(queryClient, USER, [TAXI]);
    const flushed = flushRecordOutbox(queryClient, USER);
    await settle();
    await useUndoToastStore.getState().undoVisible();
    vi.mocked(apiClient.delete).mockRejectedValueOnce({ message: 'Network error', statusCode: 0 });

    send.answer('srv-1');
    await flushed;
    expect(outboxOf(USER)).toEqual([expect.objectContaining({ cancelled: true })]);

    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { id: 'srv-1', repeated: true } });
    await flushRecordOutbox(queryClient, USER);

    expect(apiClient.delete).toHaveBeenCalledTimes(2);
    expect(outboxOf(USER)).toEqual([]);
  });

  it('one the server refuses is dropped without «Запись не отправилась»', async () => {
    const send = heldSend();
    writeOnDevice(queryClient, USER, [TAXI]);
    const flushed = flushRecordOutbox(queryClient, USER);
    await settle();
    await useUndoToastStore.getState().undoVisible();

    send.fail({ message: 'Validation failed', statusCode: 400 });
    await flushed;

    expect(outboxOf(USER)).toEqual([]);
    expect(shownToast()).toBeNull();
  });

  it('a record still waiting behind the one being sent is never sent', async () => {
    const send = heldSend();
    const [taxi] = queueRecords(USER, [TAXI]);
    const [coffee] = queueRecords(USER, [COFFEE]);
    const flushed = flushRecordOutbox(queryClient, USER);
    await settle();

    await cancelQueuedRecords(queryClient, { clientIds: [coffee.clientId], userId: USER });
    send.answer('srv-1');
    await flushed;

    expect(sentClientIds()).toEqual([taxi.clientId]);
    expect(outboxOf(USER)).toEqual([]);
  });
});
