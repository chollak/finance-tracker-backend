import { beforeEach, describe, expect, it } from 'vitest';
import { memoryOfflineStorage, setOfflineStorage, type OfflineStorage } from './storage';
import { addToOutbox, loadOutbox, outboxOf, removeFromOutbox, useOutboxStore } from './outbox';

/**
 * FT-129: what is written without a connection waits in the outbox on the device, each with the client id (FT-106) it
 * will be sent with. The screens see it at once; the device keeps it across starts.
 */

let storage: OfflineStorage;

beforeEach(() => {
  storage = memoryOfflineStorage();
  setOfflineStorage(storage);
  useOutboxStore.setState({ entries: [] });
});

const entry = (clientId: string, userId = 'u1', createdAt = 1) => ({ clientId, userId, createdAt, body: { note: clientId } });

describe('the outbox', () => {
  it('shows what was added at once, oldest first', async () => {
    void addToOutbox([entry('b', 'u1', 2), entry('a', 'u1', 1)]);

    expect(outboxOf('u1').map((row) => row.clientId)).toEqual(['a', 'b']);
  });

  it('keeps every user apart', () => {
    void addToOutbox([entry('a', 'u1'), entry('b', 'u2')]);

    expect(outboxOf('u2').map((row) => row.clientId)).toEqual(['b']);
  });

  it('is kept on the device for the next start', async () => {
    await addToOutbox([entry('a')]);
    useOutboxStore.setState({ entries: [] });

    await loadOutbox('u1');

    expect(outboxOf('u1').map((row) => row.clientId)).toEqual(['a']);
  });

  it('loads an entry once even if it is already shown', async () => {
    await addToOutbox([entry('a')]);

    await loadOutbox('u1');

    expect(outboxOf('u1')).toHaveLength(1);
  });

  it('forgets what was sent, on the device too', async () => {
    await addToOutbox([entry('a'), entry('b')]);

    await removeFromOutbox(['a']);
    useOutboxStore.setState({ entries: [] });
    await loadOutbox('u1');

    expect(outboxOf('u1').map((row) => row.clientId)).toEqual(['b']);
  });
});
