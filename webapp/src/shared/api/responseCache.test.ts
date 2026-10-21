import { afterEach, describe, expect, it, vi } from 'vitest';
import viteConfig from '../../../vite.config.ts?raw';
import { QueryClient } from '@tanstack/react-query';
import { memoryOfflineStorage, offlineStorage, restoreSavedReads, setOfflineStorage } from '@/shared/lib/offline';
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

describe('the reads kept for the offline mode (FT-129)', () => {
  it('are forgotten with the API answers, so the next account here never sees them', async () => {
    vi.stubGlobal('caches', undefined);
    setOfflineStorage(memoryOfflineStorage());
    await offlineStorage().putRead({ hash: 'a', userId: 'u1', queryKey: ['accounts', 'list', 'u1'], data: { totalMinor: 1 }, updatedAt: 1 });

    await forgetCachedResponses();
    const client = new QueryClient();
    await restoreSavedReads(client, 'u1');

    expect(client.getQueryData(['accounts', 'list', 'u1'])).toBeUndefined();
  });

  it('the server\'s health answer is never taken from the cache: it tells whether the server is there', () => {
    expect(viteConfig).toMatch(/\(\?!auth\\\/\|health\)/);
  });
});
