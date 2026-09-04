import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  hasPendingCaptureFocus,
  requestCaptureFocus,
  resetCaptureFocus,
  subscribeToCaptureFocus,
} from './captureFocus';

afterEach(() => {
  resetCaptureFocus();
});

describe('captureFocus', () => {
  it('delivers to a surface that is already listening', () => {
    const listener = vi.fn();
    subscribeToCaptureFocus(listener);

    requestCaptureFocus();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(hasPendingCaptureFocus()).toBe(false);
  });

  it('holds a request made with no surface mounted, then delivers on subscribe', () => {
    // The dock pressed on /more: navigation Home happens first, the card mounts after.
    requestCaptureFocus();
    expect(hasPendingCaptureFocus()).toBe(true);

    const listener = vi.fn();
    subscribeToCaptureFocus(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(hasPendingCaptureFocus()).toBe(false);
  });

  it('consumes a held request once, so a later remount does not steal focus', () => {
    requestCaptureFocus();

    const first = vi.fn();
    const unsubscribe = subscribeToCaptureFocus(first);
    unsubscribe();

    const second = vi.fn();
    subscribeToCaptureFocus(second);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('does not deliver to a surface after it unsubscribes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToCaptureFocus(listener);
    unsubscribe();

    requestCaptureFocus();

    expect(listener).not.toHaveBeenCalled();
    expect(hasPendingCaptureFocus()).toBe(true);
  });

  it('delivers each request, so repeated dock presses keep refocusing', () => {
    const listener = vi.fn();
    subscribeToCaptureFocus(listener);

    requestCaptureFocus();
    requestCaptureFocus();

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
