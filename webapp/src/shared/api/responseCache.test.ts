import { afterEach, describe, expect, it, vi } from 'vitest';
import viteConfig from '../../../vite.config.ts?raw';
import { QueryClient } from '@tanstack/react-query';
import { memoryOfflineStorage, offlineStorage, restoreSavedReads, setOfflineStorage } from '@/shared/lib/offline';
import { LEGACY_API_CACHE_NAME, dropLegacyApiCache, forgetCachedResponses } from './responseCache';

/**
 * #322: the service worker keeps no API answers — a slow server is waited for, never replaced by a day-old copy, and
 * without connection only the reads kept per user for the offline mode open (FT-129). A device that had the app before
 * still holds the worker's old cache: it is deleted at every start, and with «Выйти» or a lost session (FT-128).
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the service worker (vite.config.ts)', () => {
  it('has no rule for API answers: neither the old cache nor a network-first fallback', () => {
    expect(viteConfig).not.toContain(`cacheName: '${LEGACY_API_CACHE_NAME}'`);
    expect(viteConfig).not.toContain("handler: 'NetworkFirst'");
    expect(viteConfig).not.toContain('networkTimeoutSeconds');
  });

  it('caches by rule only static files, never a path under /api/', () => {
    const patterns = [...viteConfig.matchAll(/urlPattern:\s*(\/.+\/[a-z]*),/g)].map((match) => match[1]);

    expect(patterns).toEqual(['/\\.(js|css|png|jpg|jpeg|svg|woff2?)$/i']);
  });
});

describe('the API cache an earlier version of the service worker left on the device', () => {
  it('is deleted', async () => {
    const remove = vi.fn(async () => true);
    vi.stubGlobal('caches', { delete: remove });

    await dropLegacyApiCache();

    expect(remove).toHaveBeenCalledWith('api-cache');
  });

  it('goes with «Выйти» and a lost session too: an old worker may have filled it again since the start', async () => {
    const remove = vi.fn(async () => true);
    vi.stubGlobal('caches', { delete: remove });

    await forgetCachedResponses();

    expect(remove).toHaveBeenCalledWith('api-cache');
  });

  it('without the Cache API, or with storage blocked, does nothing and does not fail', async () => {
    vi.stubGlobal('caches', undefined);
    await expect(dropLegacyApiCache()).resolves.toBeUndefined();
    await expect(forgetCachedResponses()).resolves.toBeUndefined();

    vi.stubGlobal('caches', { delete: vi.fn(async () => Promise.reject(new Error('SecurityError'))) });
    await expect(dropLegacyApiCache()).resolves.toBeUndefined();
    await expect(forgetCachedResponses()).resolves.toBeUndefined();
  });
});

describe('the reads kept for the offline mode (FT-129)', () => {
  it('are forgotten with «Выйти» and a lost session, so the next account here never sees them', async () => {
    vi.stubGlobal('caches', undefined);
    setOfflineStorage(memoryOfflineStorage());
    await offlineStorage().putRead({ hash: 'a', userId: 'u1', queryKey: ['accounts', 'list', 'u1'], data: { totalMinor: 1 }, updatedAt: 1 });

    await forgetCachedResponses();
    const client = new QueryClient();
    await restoreSavedReads(client, 'u1');

    expect(client.getQueryData(['accounts', 'list', 'u1'])).toBeUndefined();
  });

  it('stay when only the old API cache is dropped: they are what opens the app without connection', async () => {
    vi.stubGlobal('caches', { delete: vi.fn(async () => true) });
    setOfflineStorage(memoryOfflineStorage());
    await offlineStorage().putRead({ hash: 'a', userId: 'u1', queryKey: ['accounts', 'list', 'u1'], data: { totalMinor: 1 }, updatedAt: 1 });

    await dropLegacyApiCache();

    expect(await offlineStorage().listReads('u1')).toHaveLength(1);
  });
});
