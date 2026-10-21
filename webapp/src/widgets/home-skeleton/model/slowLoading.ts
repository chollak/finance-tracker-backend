import { useCallback, useEffect, useState } from 'react';

/** After this long the skeleton says the loading is slow and offers to try again (Skeleton.md). */
export const SLOW_LOADING_AFTER_MS = 6_000;

/**
 * Counts the six seconds of one loading of Home. Opening Home draws the skeleton anew at each step — while
 * the gate learns about the first launch, while Home's code loads, while its data loads — and the count
 * spans all of them: it starts with the first skeleton and ends only when none stands any more.
 */
export interface LoadingClock {
  /** A skeleton appeared; the first one starts the count. Returns the ms left until it is slow. */
  show(): number;
  /** That skeleton is gone. Unless another takes its place in the same update, the next loading counts anew. */
  hide(): void;
  /** Whether the six seconds are up (reads only: a skeleton that replaces another opens already slow). */
  isSlow(): boolean;
  /** «Попробовать снова»: the six seconds start again. */
  restart(): void;
}

export function createLoadingClock({
  now,
  defer,
}: {
  now: () => number;
  /** Runs a task once the current update is over (React unmounts the old skeleton before mounting the new). */
  defer: (task: () => void) => void;
}): LoadingClock {
  let since: number | null = null;
  let onScreen = 0;
  const left = (start: number) => Math.max(0, SLOW_LOADING_AFTER_MS - (now() - start));

  return {
    show() {
      onScreen += 1;
      if (since === null) since = now();
      return left(since);
    },
    hide() {
      onScreen = Math.max(0, onScreen - 1);
      defer(() => {
        if (onScreen === 0) since = null;
      });
    },
    isSlow() {
      return since !== null && left(since) === 0;
    },
    restart() {
      since = now();
    },
  };
}

/** One skeleton on screen: calls `onSlow` when the six seconds are up. Returns the stop for its removal. */
export function watchSlowLoading(clock: LoadingClock, onSlow: () => void): () => void {
  const timer = setTimeout(onSlow, clock.show());
  return () => {
    clearTimeout(timer);
    clock.hide();
  };
}

/** The clock of Home's loading, shared by every skeleton of it. */
export const homeLoadingClock = createLoadingClock({ now: () => Date.now(), defer: (task) => queueMicrotask(task) });

/** Whether this loading of Home is slow, and the restart of its six seconds for «Попробовать снова». */
export function useSlowLoading(clock: LoadingClock = homeLoadingClock): { slow: boolean; restart: () => void } {
  const [slow, setSlow] = useState(() => clock.isSlow());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => watchSlowLoading(clock, () => setSlow(true)), [clock, attempt]);

  const restart = useCallback(() => {
    clock.restart();
    setSlow(false);
    setAttempt((value) => value + 1);
  }, [clock]);

  return { slow, restart };
}
