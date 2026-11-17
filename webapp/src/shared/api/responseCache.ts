import { forgetSavedReads } from '@/shared/lib/offline/savedReads';

/**
 * Until #322 the service worker kept API answers in this cache for a day and answered from it after 10 seconds without
 * the server, so a slow answer was replaced by an old copy shown as fresh. The worker has no rule for `/api/` any more
 * (`vite.config.ts`), but workbox deletes only its own outdated precaches — a device that had the app keeps this one
 * until it is deleted by name.
 */
export const LEGACY_API_CACHE_NAME = 'api-cache';

/**
 * Deletes what an earlier service worker kept of the API (#322). Called at every start, not once: on the first open
 * after the update the old worker still controls the page and may fill the cache again before the new one takes over.
 * The reads kept for the offline mode stay. Never fails: without the Cache API (or with storage blocked) there is
 * nothing to delete.
 */
export async function dropLegacyApiCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(LEGACY_API_CACHE_NAME);
  } catch {
    // Storage blocked: nothing kept to delete
  }
}

/**
 * Forgets the API answers kept on the device: the reads saved per user for the offline mode (FT-129) and, while an
 * earlier service worker may still be around, its cache. After «Выйти» or a lost session (FT-128) the next account in
 * this browser must find nothing of the last one's. Never fails.
 */
export async function forgetCachedResponses(): Promise<void> {
  await forgetSavedReads();
  await dropLegacyApiCache();
}
