import { describe, expect, it } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { retryUnanswered } from './retryUnanswered';

/**
 * FT-112: «Попробовать снова» on the slow skeleton asks again for whatever has not answered. On a weak
 * connection a request may hang; TanStack Query would hand a plain refetch the same hanging request, so the
 * retry has to drop it and ask anew.
 */

function watched(client: QueryClient, queryKey: string[], queryFn: () => Promise<string>) {
  return new QueryObserver(client, { queryKey, queryFn }).subscribe(() => {});
}

describe('«Попробовать снова»', () => {
  it('asks again for a read that hangs instead of waiting for it', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let calls = 0;
    const stop = watched(client, ['accounts'], () => {
      calls += 1;
      return calls === 1 ? new Promise<string>(() => {}) : Promise.resolve('balances');
    });

    await retryUnanswered(client);

    expect(calls).toBe(2);
    expect(client.getQueryData(['accounts'])).toBe('balances');
    stop();
  });

  it('asks again for a read that failed', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let calls = 0;
    const stop = watched(client, ['totals'], () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('down')) : Promise.resolve('month');
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    await retryUnanswered(client);

    expect(client.getQueryData(['totals'])).toBe('month');
    stop();
  });

  it('leaves alone what has already answered', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(['settings'], 'saved');
    let calls = 0;
    const stop = watched(client, ['settings'], () => {
      calls += 1;
      return Promise.resolve('again');
    });

    await retryUnanswered(client);

    expect(calls).toBe(0);
    expect(client.getQueryData(['settings'])).toBe('saved');
    stop();
  });
});
