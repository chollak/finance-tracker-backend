import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryObserver, type QueryKey } from '@tanstack/react-query';
import { memoryOfflineStorage, setOfflineStorage } from './storage';
import { forgetSavedReads, persistReads, restoreSavedReads } from './savedReads';

/**
 * FT-129: Home and the accounts open without a connection from what was read last time. The answers of the reads a
 * screen needs are kept on the device; offline they fill the reads that have nothing yet, for the user they belong to.
 */

const SAVED = ['accounts', 'list'];
/** Keeps reads whose key starts with ['accounts', 'list', userId]. */
const userOf = (queryKey: QueryKey) =>
  queryKey[0] === SAVED[0] && queryKey[1] === SAVED[1] && typeof queryKey[2] === 'string' ? queryKey[2] : null;

let stop: (() => void) | null = null;

beforeEach(() => {
  setOfflineStorage(memoryOfflineStorage());
});

afterEach(() => {
  stop?.();
  stop = null;
});

/** Lets the storage writes that follow a read finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function answer(client: QueryClient, queryKey: QueryKey, data: unknown): Promise<void> {
  await client.fetchQuery({ queryKey, queryFn: () => data });
  await settle();
}

describe('a read that answered', () => {
  it('is kept and fills the same read of the next start', async () => {
    const before = new QueryClient();
    stop = persistReads(before, { userOf });
    await answer(before, ['accounts', 'list', 'u1'], { totalMinor: 974_300_000 });

    const after = new QueryClient();
    await restoreSavedReads(after, 'u1');

    expect(after.getQueryData(['accounts', 'list', 'u1'])).toEqual({ totalMinor: 974_300_000 });
  });

  it('keeps when it was read, so the restored read is refreshed as soon as the server answers', async () => {
    const before = new QueryClient();
    stop = persistReads(before, { userOf });
    await answer(before, ['accounts', 'list', 'u1'], { totalMinor: 1 });
    const readAt = before.getQueryState(['accounts', 'list', 'u1'])?.dataUpdatedAt;

    const after = new QueryClient();
    await restoreSavedReads(after, 'u1');

    expect(after.getQueryState(['accounts', 'list', 'u1'])?.dataUpdatedAt).toBe(readAt);
  });

  it('is not kept when the policy does not name its user', async () => {
    const before = new QueryClient();
    stop = persistReads(before, { userOf });
    await answer(before, ['history', 'u1'], { items: [] });

    const after = new QueryClient();
    await restoreSavedReads(after, 'u1');

    expect(after.getQueryData(['history', 'u1'])).toBeUndefined();
  });
});

describe('restoring', () => {
  it('fills only the reads of the user who opens the app', async () => {
    const before = new QueryClient();
    stop = persistReads(before, { userOf });
    await answer(before, ['accounts', 'list', 'u1'], { who: 'u1' });
    await answer(before, ['accounts', 'list', 'u2'], { who: 'u2' });

    const after = new QueryClient();
    await restoreSavedReads(after, 'u2');

    expect(after.getQueryData(['accounts', 'list', 'u1'])).toBeUndefined();
    expect(after.getQueryData(['accounts', 'list', 'u2'])).toEqual({ who: 'u2' });
  });

  it('never replaces what this session has already read', async () => {
    const before = new QueryClient();
    stop = persistReads(before, { userOf });
    await answer(before, ['accounts', 'list', 'u1'], { totalMinor: 1 });

    const after = new QueryClient();
    after.setQueryData(['accounts', 'list', 'u1'], { totalMinor: 2 });
    await restoreSavedReads(after, 'u1');

    expect(after.getQueryData(['accounts', 'list', 'u1'])).toEqual({ totalMinor: 2 });
  });

  it('gives a screen waiting for the read its data', async () => {
    const before = new QueryClient();
    stop = persistReads(before, { userOf });
    await answer(before, ['accounts', 'list', 'u1'], { totalMinor: 5 });

    const after = new QueryClient();
    const observer = new QueryObserver(after, { queryKey: ['accounts', 'list', 'u1'], enabled: false });
    const unsubscribe = observer.subscribe(() => {});
    expect(observer.getCurrentResult().isPending).toBe(true);
    await restoreSavedReads(after, 'u1');

    expect(observer.getCurrentResult()).toMatchObject({ isPending: false, data: { totalMinor: 5 } });
    unsubscribe();
  });
});

describe('forgetting', () => {
  it('leaves nothing for the next account in this browser («Выйти»)', async () => {
    const before = new QueryClient();
    stop = persistReads(before, { userOf });
    await answer(before, ['accounts', 'list', 'u1'], { totalMinor: 1 });

    await forgetSavedReads();
    const after = new QueryClient();
    await restoreSavedReads(after, 'u1');

    expect(after.getQueryData(['accounts', 'list', 'u1'])).toBeUndefined();
  });
});
