import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { isNoConnectionError, isOffline } from '@/shared/lib/offline';
import { pageLoaders, SCREENS_AFTER_HOME } from './pageLoaders';

/** `requestIdleCallback` gives the browser this long at most before the load ahead starts. */
const IDLE_TIMEOUT_MS = 3000;
/** Safari and the iOS WebView have no `requestIdleCallback`: the load ahead starts this long after Home's reads. */
const IDLE_FALLBACK_MS = 1000;

type Stop = () => void;
type Load = () => Promise<unknown>;

/** Runs `run` at an idle moment of the browser; returns the cancel. */
export function whenIdle(run: () => void): Stop {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, IDLE_FALLBACK_MS);
  return () => window.clearTimeout(id);
}

/** Runs `run` once no read is on its way (Home's own come first); returns the cancel. */
function whenReadsSettle(client: QueryClient, run: () => void): Stop {
  if (client.isFetching() === 0) {
    run();
    return () => {};
  }
  const unsubscribe = client.getQueryCache().subscribe(() => {
    if (client.isFetching() > 0) return;
    unsubscribe();
    run();
  });
  return unsubscribe;
}

/**
 * Whether loading ahead is safe now. A piece that failed to load stays failed until the app is loaded again (Chrome
 * remembers a failed `import()`), so a load ahead on a bad connection would break a screen that would have opened
 * later: not while the app is offline, nor when a read on screen got no answer at all.
 */
function connectionLooksGood(client: QueryClient): boolean {
  if (isOffline()) return false;
  const onScreen = client.getQueryCache().findAll({ type: 'active' });
  return !onScreen.some((query) => query.state.status === 'error' && isNoConnectionError(query.state.error));
}

/** One screen after another; the first failure ends it, quietly — that screen shows «Экран не открылся» if opened. */
async function loadInTurn(loads: readonly Load[]): Promise<void> {
  for (const load of loads) {
    try {
      await load();
    } catch {
      return;
    }
  }
}

/**
 * The load ahead after Home (#291): once Home's reads are in and the browser is idle, the code of the screens Home
 * leads to loads, so the first move to a screen does not wait for its piece. It runs once per app, never again after a
 * failure. Without a connection, or when Home is left before that moment, it waits for Home to be shown again.
 * Returns the cancel for the moment Home is left.
 */
export function createScreenPrefetch(loads: readonly Load[], idle: (run: () => void) => Stop = whenIdle) {
  let started = false;

  return function prefetch(client: QueryClient): Stop {
    if (started) return () => {};
    let left = false;
    let stopIdle: Stop = () => {};
    const stopReads = whenReadsSettle(client, () => {
      if (left) return;
      stopIdle = idle(() => {
        if (left || started || !connectionLooksGood(client)) return;
        started = true;
        void loadInTurn(loads);
      });
    });
    return () => {
      left = true;
      stopReads();
      stopIdle();
    };
  };
}

// Each load looks its loader up when it runs, so it is the same function the router's `lazy()` calls
const prefetchScreensAfterHome = createScreenPrefetch(SCREENS_AFTER_HOME.map((key) => () => pageLoaders[key]()));

/** Drawn beside Home: once Home is on screen, the other screens' code loads ahead (#291). Draws nothing. */
export function PrefetchScreensAfterHome() {
  const client = useQueryClient();
  useEffect(() => prefetchScreensAfterHome(client), [client]);
  return null;
}
