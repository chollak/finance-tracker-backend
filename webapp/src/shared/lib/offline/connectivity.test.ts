// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  connectionLost,
  connectionReached,
  isNoConnectionError,
  isOffline,
  useConnectivityStore,
  watchBrowserConnection,
} from './connectivity';

/**
 * FT-129, OfflineBar.md: the app works without a connection when the device says it has none (the browser's
 * `online`/`offline`), and also when the server stopped answering — a write that could not reach it, or «Записывать без
 * связи» under a slow loading. The next answer from the server brings it back.
 */

let stop: (() => void) | null = null;

function setBrowserOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

beforeEach(() => {
  setBrowserOnline(true);
  useConnectivityStore.setState({ browserOnline: true, lost: false });
});

afterEach(() => {
  stop?.();
  stop = null;
});

describe('whether the app is offline', () => {
  it('follows the browser', () => {
    stop = watchBrowserConnection();
    expect(isOffline()).toBe(false);

    setBrowserOnline(false);
    expect(isOffline()).toBe(true);

    setBrowserOnline(true);
    expect(isOffline()).toBe(false);
  });

  it('starts offline when the device opens the app without a connection', () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });

    stop = watchBrowserConnection();

    expect(isOffline()).toBe(true);
  });

  it('is offline once the server could not be reached, even if the browser says it is online', () => {
    stop = watchBrowserConnection();

    connectionLost();

    expect(isOffline()).toBe(true);
  });

  it('is online again when the server answers', () => {
    stop = watchBrowserConnection();
    connectionLost();

    connectionReached();

    expect(isOffline()).toBe(false);
  });
});

describe('an error of the API client', () => {
  it('is «no connection» when the request got no answer at all', () => {
    expect(isNoConnectionError({ message: 'Network error', statusCode: 0 })).toBe(true);
  });

  it.each([400, 401, 404, 500])('is not, when the server answered %i', (statusCode) => {
    expect(isNoConnectionError({ message: 'Request failed', statusCode })).toBe(false);
  });

  it('is not, for anything else', () => {
    expect(isNoConnectionError(new Error('boom'))).toBe(false);
    expect(isNoConnectionError(undefined)).toBe(false);
  });
});
