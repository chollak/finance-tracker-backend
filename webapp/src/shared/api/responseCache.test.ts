import { afterEach, describe, expect, it, vi } from 'vitest';
import viteConfig from '../../../vite.config.ts?raw';
import { API_CACHE_NAME, forgetCachedResponses } from './responseCache';

/**
 * FT-128 review: «Выйти» and a lost session drop the service worker's cache of API answers, so the next account in
 * this browser is never served the last one's.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('forgetting the cached API answers', () => {
  it('deletes the service worker\'s API cache', async () => {
    const remove = vi.fn(async () => true);
    vi.stubGlobal('caches', { delete: remove });

    await forgetCachedResponses();

    expect(remove).toHaveBeenCalledWith('api-cache');
  });

  it('without the Cache API, or with storage blocked, does nothing and does not fail', async () => {
    vi.stubGlobal('caches', undefined);
    await expect(forgetCachedResponses()).resolves.toBeUndefined();

    vi.stubGlobal('caches', { delete: vi.fn(async () => Promise.reject(new Error('SecurityError'))) });
    await expect(forgetCachedResponses()).resolves.toBeUndefined();
  });

  it('names the cache the service worker fills (vite.config.ts)', () => {
    expect(viteConfig).toContain(`cacheName: '${API_CACHE_NAME}'`);
  });
});
