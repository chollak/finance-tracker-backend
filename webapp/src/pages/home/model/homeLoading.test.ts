import { describe, expect, it } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { isHomeLoading } from './homeLoading';

/**
 * FT-112: Home opens on its skeleton until its first reads — the balances, the month's totals, the recent
 * records and the categories they are shown with — have answered, so it does not appear piece by piece.
 * The reads are real TanStack Query results, in the states a read goes through.
 */

type ReadState = 'on its way' | 'answered' | 'failed' | 'not running';

let n = 0;
function read(state: ReadState) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const queryKey = ['read', (n += 1)];
  if (state === 'answered') client.setQueryData(queryKey, { ok: true });
  if (state === 'failed') {
    client.getQueryCache().build(client, { queryKey }).setState({ status: 'error', error: new Error('down') });
  }
  // «not running»: a read this user does not make (guests have no server balances or totals)
  return new QueryObserver(client, { queryKey, queryFn: () => ({ ok: true }), enabled: state !== 'not running' }).getCurrentResult();
}

const reads = (...states: ReadState[]) => states.map(read);

describe('Home is its skeleton', () => {
  it('while its reads are on their way', () => {
    expect(isHomeLoading({ isGuest: false, reads: reads('on its way', 'on its way', 'on its way', 'on its way') })).toBe(true);
  });

  it.each([0, 1, 2, 3])('while one of them (#%i) is still on its way: nothing appears piece by piece', (index) => {
    const states = (['answered', 'answered', 'answered', 'answered'] as ReadState[]).map((state, i) =>
      i === index ? 'on its way' : state
    );

    expect(isHomeLoading({ isGuest: false, reads: reads(...states) })).toBe(true);
  });
});

describe('Home shows itself', () => {
  it('once every read has answered', () => {
    expect(isHomeLoading({ isGuest: false, reads: reads('answered', 'answered', 'answered', 'answered') })).toBe(false);
  });

  it('when a read failed: its section says what failed and offers to read it again', () => {
    expect(isHomeLoading({ isGuest: false, reads: reads('failed', 'answered', 'answered', 'answered') })).toBe(false);
  });

  it('without waiting for reads that do not run for this user', () => {
    expect(isHomeLoading({ isGuest: false, reads: reads('not running', 'not running', 'answered', 'answered') })).toBe(false);
  });

  it('to guests at once: their records are on the device, and the skeleton promises records on the server', () => {
    expect(isHomeLoading({ isGuest: true, reads: reads('not running', 'not running', 'on its way', 'on its way') })).toBe(false);
  });
});
