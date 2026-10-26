import { forgetSavedReads } from '@/shared/lib/offline/savedReads';

/**
 * The service worker keeps API answers in this cache (`vite.config.ts`, workbox `runtimeCaching`, NetworkFirst for a
 * day; it answers from it after 10 seconds without network). The name is the same there.
 */
export const API_CACHE_NAME = 'api-cache';

/**
 * Forgets the API answers the service worker kept (FT-128), and the reads kept on the device for the offline mode. Since milestone 10 routes such as `/api/accounts`,
 * `/api/settings` and `/api/categories` don't name the user, so after «Выйти» or a lost session the next account in
 * this browser must not be served the last one's on a slow network. Never fails: without the Cache API (or with
 * storage blocked) there is nothing to forget.
 */
export async function forgetCachedResponses(): Promise<void> {
  // The reads kept on the device for the offline mode (FT-129) are API answers too
  await forgetSavedReads();
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(API_CACHE_NAME);
  } catch {
    // Storage blocked: nothing kept to forget
  }
}
