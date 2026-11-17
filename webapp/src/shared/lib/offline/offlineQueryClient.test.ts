import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryObserver, onlineManager, type QueryClient } from '@tanstack/react-query';
import { createOfflineQueryClient } from './offlineQueryClient';

/**
 * #322: a read with nothing to show does not wait for the connection on a skeleton — it fails as «no answer», so its
 * screen says so and offers to read again. A read that has something (kept on the device, FT-129, or read earlier)
 * keeps showing it and waits. Until #322 the service worker's cache hid this: it answered such reads itself.
 */

const NO_ANSWER = { message: 'Network error', statusCode: 0 };
const KEY = ['transactions', 'list', 'u1', 'history'];

let client: QueryClient;
let stops: Array<() => void>;

beforeEach(() => {
  client = createOfflineQueryClient();
  client.mount();
  stops = [];
});

afterEach(() => {
  stops.forEach((stop) => stop());
  client.unmount();
  client.clear();
  onlineManager.setOnline(true);
});

type Retry = boolean | number | ((failureCount: number, error: unknown) => boolean);

function watch(queryFn: () => Promise<unknown>, options: { retry?: Retry; retryDelay?: number } = {}) {
  const observer = new QueryObserver(client, { queryKey: KEY, queryFn, staleTime: 0, ...options });
  stops.push(observer.subscribe(() => {}));
  return observer;
}

const settled = () => vi.waitFor(() => expect(client.isFetching()).toBe(0));

describe('without a connection', () => {
  beforeEach(() => onlineManager.setOnline(false));

  it('a read with nothing to show fails as «no answer» at once instead of waiting', async () => {
    const queryFn = vi.fn(async () => Promise.reject(NO_ANSWER));
    const observer = watch(queryFn);

    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('error'));

    expect(observer.getCurrentResult()).toMatchObject({ fetchStatus: 'idle', isPaused: false, error: NO_ANSWER });
    // Not tried again: there is no connection to try on
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  // The account screen and a category of analytics retry by their own rule (not after a 404): the rule «no retry
  // without a connection» is the client's, so it holds for them too
  it.each<[string, Retry]>([
    ['its own rule', (failures, error) => (error as { statusCode?: number }).statusCode !== 404 && failures < 2],
    ['a number', 3],
    ['true', true],
  ])('a read that retries by %s fails at once too: no retry waits for the connection', async (_name, retry) => {
    const queryFn = vi.fn(async () => Promise.reject(NO_ANSWER));
    const observer = watch(queryFn, { retry, retryDelay: 1 });

    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('error'));

    expect(observer.getCurrentResult()).toMatchObject({ fetchStatus: 'idle', isPaused: false });
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('a read that has something keeps it and waits: nothing is asked, nothing fails', async () => {
    client.setQueryData(KEY, ['kept'], { updatedAt: 1 });
    const queryFn = vi.fn(async () => Promise.reject(NO_ANSWER));
    const observer = watch(queryFn);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(observer.getCurrentResult()).toMatchObject({ status: 'success', data: ['kept'], fetchStatus: 'paused' });
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('the failed read is read again by itself when the connection is back', async () => {
    let answer: () => Promise<unknown> = async () => Promise.reject(NO_ANSWER);
    const observer = watch(() => answer());
    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('error'));

    answer = async () => ['fresh'];
    onlineManager.setOnline(true);

    await vi.waitFor(() => expect(observer.getCurrentResult()).toMatchObject({ status: 'success', data: ['fresh'] }));
  });

  it('«Попробовать снова» without a connection fails again rather than hanging', async () => {
    const queryFn = vi.fn(async () => Promise.reject(NO_ANSWER));
    const observer = watch(queryFn);
    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('error'));

    await observer.refetch();

    expect(observer.getCurrentResult()).toMatchObject({ status: 'error', fetchStatus: 'idle' });
    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});

describe('with a connection', () => {
  it('a read the server did not answer is tried once more, as before', async () => {
    const queryFn = vi.fn(async () => Promise.reject(NO_ANSWER));
    const observer = new QueryObserver(client, { queryKey: KEY, queryFn, retryDelay: 1 });
    stops.push(observer.subscribe(() => {}));

    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('error'));

    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it.each<[string, Retry, number]>([
    ['its own rule', (failures) => failures < 2, 3],
    ['a number', 3, 4],
    ['false', false, 1],
  ])('a read that retries by %s retries as it says', async (_name, retry, asked) => {
    const queryFn = vi.fn(async () => Promise.reject(NO_ANSWER));
    const observer = watch(queryFn, { retry, retryDelay: 1 });

    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('error'));

    expect(queryFn).toHaveBeenCalledTimes(asked);
  });

  it('without a connection an answer of the server is still judged by the read\'s own rule', async () => {
    onlineManager.setOnline(false);
    const queryFn = vi.fn(async () => Promise.reject({ message: 'Internal error', statusCode: 500 }));
    const observer = watch(queryFn, { retry: false });

    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('error'));

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('a read with nothing to show that loses the connection on the way fails; it does not wait to try again', async () => {
    const queryFn = vi.fn(async () => {
      onlineManager.setOnline(false);
      return Promise.reject(NO_ANSWER);
    });
    const observer = watch(queryFn);

    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('error'));
    await settled();

    expect(observer.getCurrentResult().fetchStatus).toBe('idle');
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('keeps the app\'s defaults: five minutes fresh, no refetch on focus, writes not retried', () => {
    expect(client.getDefaultOptions()).toMatchObject({
      queries: { staleTime: 300_000, gcTime: 600_000, refetchOnWindowFocus: false },
      mutations: { retry: 0 },
    });
  });
});
