import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLoadingClock, SLOW_LOADING_AFTER_MS, watchSlowLoading } from './slowLoading';

/**
 * FT-112 (Skeleton.md): six seconds after Home's skeleton appeared it says the loading takes longer than
 * usual and offers «Попробовать снова». Opening Home draws the skeleton several times — while the settings
 * load, while Home's code loads, while its data loads — and the six seconds count across all of them.
 */

/** A clock on a hand-moved time; `settle()` runs what the clock put off until the end of the update. */
function testClock() {
  let time = 1_000;
  const deferred: Array<() => void> = [];
  const clock = createLoadingClock({ now: () => time, defer: (task) => deferred.push(task) });
  return {
    clock,
    advance: (ms: number) => {
      time += ms;
    },
    settle: () => deferred.splice(0).forEach((task) => task()),
  };
}

describe('the loading clock', () => {
  it('waits six seconds before calling the loading slow', () => {
    const { clock, advance } = testClock();

    expect(SLOW_LOADING_AFTER_MS).toBe(6_000);
    expect(clock.show()).toBe(6_000);
    advance(5_999);
    expect(clock.isSlow()).toBe(false);
    advance(1);
    expect(clock.isSlow()).toBe(true);
  });

  it('keeps counting when another skeleton takes the place of the first in the same update', () => {
    const { clock, advance, settle } = testClock();
    clock.show();
    advance(4_000);

    // The settings came; Home's code now loads behind its own skeleton
    clock.hide();
    expect(clock.show()).toBe(2_000);
    settle();

    advance(2_000);
    expect(clock.isSlow()).toBe(true);
  });

  it('starts from zero next time once Home itself was on screen', () => {
    const { clock, advance, settle } = testClock();
    clock.show();
    advance(7_000);

    clock.hide();
    settle();

    expect(clock.isSlow()).toBe(false);
    expect(clock.show()).toBe(6_000);
  });

  it('gives «Попробовать снова» six more seconds', () => {
    const { clock, advance } = testClock();
    clock.show();
    advance(7_000);
    expect(clock.isSlow()).toBe(true);

    clock.restart();

    expect(clock.isSlow()).toBe(false);
    advance(5_999);
    expect(clock.isSlow()).toBe(false);
    advance(1);
    expect(clock.isSlow()).toBe(true);
  });
});

describe('a skeleton on screen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const realClock = () => createLoadingClock({ now: () => Date.now(), defer: (task) => task() });

  it('turns slow after six seconds, not before', () => {
    const onSlow = vi.fn();
    watchSlowLoading(realClock(), onSlow);

    vi.advanceTimersByTime(5_999);
    expect(onSlow).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onSlow).toHaveBeenCalledTimes(1);
  });

  it('says nothing once it is gone before the six seconds are up', () => {
    const onSlow = vi.fn();
    const stop = watchSlowLoading(realClock(), onSlow);

    vi.advanceTimersByTime(3_000);
    stop();
    vi.advanceTimersByTime(10_000);

    expect(onSlow).not.toHaveBeenCalled();
  });

  it('one that replaces another turns slow six seconds after the first appeared', () => {
    const clock = createLoadingClock({ now: () => Date.now(), defer: (task) => queueMicrotask(task) });
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = watchSlowLoading(clock, first);

    vi.advanceTimersByTime(4_000);
    stopFirst();
    watchSlowLoading(clock, second);
    vi.advanceTimersByTime(2_000);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
