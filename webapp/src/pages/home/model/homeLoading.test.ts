import { describe, expect, it } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { isHomeLoading } from './homeLoading';

/**
 * FT-112: Home opens on its skeleton until its first reads — the balances, the month's totals, the recent
 * records and the categories they are shown with — have answered, so it does not appear piece by piece.
 * The reads are real TanStack Query results, in the states a read goes through.
 */

type ReadState = 'on its way' | 'answered' | 'failed' | 'failed, asked again' | 'not running';

let n = 0;
function read(state: ReadState) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const queryKey = ['read', (n += 1)];
  if (state === 'answered') client.setQueryData(queryKey, { ok: true });
  const query = client.getQueryCache().build(client, { queryKey });
  if (state === 'failed') {
    query.setState({ status: 'error', error: new Error('down'), errorUpdateCount: 1, errorUpdatedAt: Date.now() });
  }
  if (state === 'failed, asked again') {
    // What TanStack makes of a failed read with no data while it asks it again: pending, but answered once
    query.setState({ status: 'pending', fetchStatus: 'fetching', error: null, errorUpdateCount: 1, errorUpdatedAt: Date.now() });
  }
  // «not running»: a read that is off (no user yet, or nothing to read)
  return new QueryObserver(client, { queryKey, queryFn: () => ({ ok: true }), enabled: state !== 'not running' }).getCurrentResult();
}

const reads = (...states: ReadState[]) => states.map(read);

describe('Home is its skeleton', () => {
  it('while its reads are on their way', () => {
    expect(isHomeLoading({ reads: reads('on its way', 'on its way', 'on its way', 'on its way') })).toBe(true);
  });

  it.each([0, 1, 2, 3])('while one of them (#%i) is still on its way: nothing appears piece by piece', (index) => {
    const states = (['answered', 'answered', 'answered', 'answered'] as ReadState[]).map((state, i) =>
      i === index ? 'on its way' : state
    );

    expect(isHomeLoading({ reads: reads(...states) })).toBe(true);
  });
});

describe('Home shows itself', () => {
  it('once every read has answered', () => {
    expect(isHomeLoading({ reads: reads('answered', 'answered', 'answered', 'answered') })).toBe(false);
  });

  it('when a read failed: its section says what failed and offers to read it again', () => {
    expect(isHomeLoading({ reads: reads('failed', 'answered', 'answered', 'answered') })).toBe(false);
  });

  it('and stays while a failed read is asked again: its section waits for that answer, not the whole of Home', () => {
    expect(isHomeLoading({ reads: reads('failed, asked again', 'answered', 'answered', 'answered') })).toBe(false);
  });

  it('without waiting for reads that do not run for this user', () => {
    expect(isHomeLoading({ reads: reads('not running', 'not running', 'answered', 'answered') })).toBe(false);
  });
});

describe('FT-112 review: a read that fails before it has data', () => {
  /**
   * The loop the review found: the read fails, Home shows itself, its sections mount new observers of the read,
   * TanStack asks a failed read with no data again on mount (retryOnMount) and makes it pending. If that put
   * Home back on its skeleton, the sections would unmount, the read would fail again, and so on without end.
   */
  it('does not put Home back on its skeleton when a section mounted since asks it again', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryKey = ['accounts'];
    let calls = 0;
    const queryFn = () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('500')) : new Promise<never>(() => {});
    };
    await client.prefetchQuery({ queryKey, queryFn });
    expect(client.getQueryState(queryKey)?.status).toBe('error');

    const section = new QueryObserver(client, { queryKey, queryFn });
    const stop = section.subscribe(() => {});
    const accounts = section.getCurrentResult();

    expect(calls).toBe(2);
    expect(accounts.isPending).toBe(true);
    expect(isHomeLoading({ reads: [accounts, ...reads('answered', 'answered', 'answered')] })).toBe(false);
    stop();
  });
});

/**
 * FT-129: without a connection the reads that have nothing cannot answer, so Home does not wait for them — it opens on
 * what it has (the reads kept from the last time) with the offline line, and the writing works.
 */
describe('Home without a connection', () => {
  it('opens at once, even with its reads still waiting', () => {
    expect(isHomeLoading({ reads: reads('on its way', 'on its way', 'answered', 'answered'), offline: true })).toBe(false);
  });

  it('online it waits as before', () => {
    expect(isHomeLoading({ reads: reads('on its way', 'answered', 'answered', 'answered'), offline: false })).toBe(true);
  });
});
