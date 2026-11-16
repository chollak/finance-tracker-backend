// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { useConnectivityStore } from '@/shared/lib/offline';
import { createScreenPrefetch, whenIdle } from './screenPrefetch';

/**
 * #291: once Home is drawn, the code of the screens it leads to loads ahead, so the first move to a screen does not
 * wait for its piece. A browser remembers a piece that failed to load until the app is loaded again (Chrome does), so
 * a load ahead must not make a screen fail that would have opened: it waits for Home's own reads, skips a bad
 * connection, loads the screens one at a time and stops at the first failure, without a word in the console.
 */

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** An idle moment the test brings itself. */
function manualIdle() {
  const pending: Array<() => void> = [];
  const cancelled = vi.fn();
  const idle = vi.fn((run: () => void) => {
    pending.push(run);
    return cancelled;
  });
  return { idle, cancelled, come: () => pending.splice(0).forEach((run) => run()) };
}

let client: QueryClient;
let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useConnectivityStore.setState({ browserOnline: true, lost: false });
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  client.clear();
  errors.mockRestore();
});

describe('loading the screens ahead after Home', () => {
  it('waits for Home’s reads, then for an idle moment', async () => {
    const read = deferred();
    void client.fetchQuery({ queryKey: ['home'], queryFn: () => read.promise });
    const load = vi.fn(async () => {});
    const { idle, come } = manualIdle();

    createScreenPrefetch([load], idle)(client);
    expect(idle).not.toHaveBeenCalled();

    read.resolve({});
    await flush();
    expect(idle).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();

    come();
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('loads the screens one after another, and only once', async () => {
    const first = deferred();
    const loads = [vi.fn(() => first.promise), vi.fn(async () => {})];
    const { idle, come } = manualIdle();
    const prefetch = createScreenPrefetch(loads, idle);

    prefetch(client);
    come();
    await flush();
    expect(loads[0]).toHaveBeenCalledTimes(1);
    expect(loads[1]).not.toHaveBeenCalled();

    first.resolve({});
    await flush();
    expect(loads[1]).toHaveBeenCalledTimes(1);

    // Home shown again: nothing more
    prefetch(client);
    come();
    await flush();
    expect(loads[0]).toHaveBeenCalledTimes(1);
    expect(loads[1]).toHaveBeenCalledTimes(1);
  });

  it('stops at the first failure, without a word in the console, and never tries again', async () => {
    const loads = [
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/page-transactions-x.js'))),
      vi.fn(async () => {}),
    ];
    const { idle, come } = manualIdle();
    const prefetch = createScreenPrefetch(loads, idle);

    prefetch(client);
    come();
    await flush();
    await flush();

    expect(loads[0]).toHaveBeenCalledTimes(1);
    expect(loads[1]).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();

    prefetch(client);
    come();
    await flush();
    expect(loads[0]).toHaveBeenCalledTimes(1);
  });

  it('without a connection it loads nothing and waits for Home to be shown again', async () => {
    const load = vi.fn(async () => {});
    const { idle, come } = manualIdle();
    const prefetch = createScreenPrefetch([load], idle);

    useConnectivityStore.setState({ browserOnline: false });
    prefetch(client);
    come();
    await flush();
    expect(load).not.toHaveBeenCalled();

    useConnectivityStore.setState({ browserOnline: true });
    prefetch(client);
    come();
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('when a read on Home got no answer at all, it loads nothing', async () => {
    const observer = new QueryObserver(client, {
      queryKey: ['home'],
      queryFn: () => Promise.reject(Object.assign(new Error('Network Error'), { statusCode: 0 })),
    });
    const stop = observer.subscribe(() => {});
    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('error'));
    const load = vi.fn(async () => {});
    const { idle, come } = manualIdle();

    createScreenPrefetch([load], idle)(client);
    come();
    await flush();

    expect(load).not.toHaveBeenCalled();
    stop();
  });

  describe('a read Home asks for again before the moment (it has no data, so the error is cleared)', () => {
    const noAnswer = () => Object.assign(new Error('Network Error'), { statusCode: 0 });

    async function failedThenAskedAgain() {
      const attempts = [deferred(), deferred()];
      let attempt = 0;
      const observer = new QueryObserver(client, { queryKey: ['totals'], queryFn: () => attempts[attempt++].promise });
      const stop = observer.subscribe(() => {});
      attempts[0].reject(noAnswer());
      await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('error'));
      const load = vi.fn(async () => {});
      const { idle, come } = manualIdle();

      createScreenPrefetch([load], idle)(client);
      expect(idle).toHaveBeenCalledTimes(1);
      void observer.refetch();
      come();
      await flush();
      return { second: attempts[1], load, idle, come, stop };
    }

    it('waits for its answer; none again — nothing loads', async () => {
      const { second, load, idle, come, stop } = await failedThenAskedAgain();
      expect(load).not.toHaveBeenCalled();

      second.reject(noAnswer());
      await flush();
      expect(idle).toHaveBeenCalledTimes(2);
      come();
      await flush();

      expect(load).not.toHaveBeenCalled();
      stop();
    });

    it('waits for its answer; an answer — the screens load', async () => {
      const { second, load, come, stop } = await failedThenAskedAgain();

      second.resolve({});
      await flush();
      come();
      await flush();

      expect(load).toHaveBeenCalledTimes(1);
      stop();
    });
  });

  it('a read waiting for another attempt after one with no answer: nothing loads', async () => {
    const observer = new QueryObserver(client, { queryKey: ['totals'], queryFn: () => new Promise(() => {}) });
    const stop = observer.subscribe(() => {});
    // As TanStack leaves it when the connection goes during its retry: no error yet, the last attempt's failure kept
    client.getQueryCache().find({ queryKey: ['totals'] })!.setState({
      status: 'pending',
      error: null,
      fetchStatus: 'paused',
      fetchFailureCount: 1,
      fetchFailureReason: Object.assign(new Error('Network Error'), { statusCode: 0 }),
    });
    const load = vi.fn(async () => {});
    const { idle, come } = manualIdle();

    createScreenPrefetch([load], idle)(client);
    come();
    await flush();

    expect(load).not.toHaveBeenCalled();
    stop();
  });

  it('a read the server refused is no reason to wait: the connection is there', async () => {
    const observer = new QueryObserver(client, {
      queryKey: ['home'],
      queryFn: () => Promise.reject(Object.assign(new Error('Internal Server Error'), { statusCode: 500 })),
    });
    const stop = observer.subscribe(() => {});
    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('error'));
    const load = vi.fn(async () => {});
    const { idle, come } = manualIdle();

    createScreenPrefetch([load], idle)(client);
    come();
    await flush();

    expect(load).toHaveBeenCalledTimes(1);
    stop();
  });

  it('Home left before the moment: the wait is dropped, and the next Home starts it again', async () => {
    const read = deferred();
    void client.fetchQuery({ queryKey: ['home'], queryFn: () => read.promise });
    const load = vi.fn(async () => {});
    const { idle, cancelled, come } = manualIdle();
    const prefetch = createScreenPrefetch([load], idle);

    const leave = prefetch(client);
    leave();
    read.resolve({});
    await flush();
    expect(idle).not.toHaveBeenCalled();

    const leaveAgain = prefetch(client);
    expect(idle).toHaveBeenCalledTimes(1);
    leaveAgain();
    expect(cancelled).toHaveBeenCalledTimes(1);
    come();
    await flush();
    expect(load).not.toHaveBeenCalled();

    prefetch(client);
    come();
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('the idle moment', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is requestIdleCallback where the browser has it', () => {
    const request = vi.fn(() => 7);
    const cancel = vi.fn();
    vi.stubGlobal('requestIdleCallback', request);
    vi.stubGlobal('cancelIdleCallback', cancel);
    const run = vi.fn();

    const stop = whenIdle(run);
    expect(request).toHaveBeenCalledWith(run, { timeout: expect.any(Number) });

    stop();
    expect(cancel).toHaveBeenCalledWith(7);
  });

  it('is a timer in Safari and the iOS WebView, which have none', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    const run = vi.fn();

    whenIdle(run);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);

    const later = vi.fn();
    const stop = whenIdle(later);
    stop();
    vi.advanceTimersByTime(5000);
    expect(later).not.toHaveBeenCalled();
  });
});
