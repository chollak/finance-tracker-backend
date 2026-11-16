import express, { Express, RequestHandler } from 'express';
import { ServerResponse } from 'http';
import path from 'path';

/** A file named by its content never changes under that name: the browser keeps it for good (#380). */
const KEEP_FOR_GOOD = 'public, max-age=31536000, immutable';
/** Vite's `[name]-[hash]`: eight base64url characters before the extension — `index-BLbtmfHV.js`. */
const CONTENT_HASH_IN_NAME = /-[\w-]{8}\.\w+$/;

/**
 * Cache-Control of the web app's files (#380). What Vite builds into `assets/` is named by its content, so a new version
 * is a new name and such a file is kept for good; before, every file was `max-age=0`, and the Mini App without a
 * service worker (Telegram on the iPhone) asked the server about each of them on every open. Both checks: a file Vite
 * copies as is from `webapp/public/assets/` lands in the same folder without a hash and would never be updated.
 * Everything else keeps express.static's `public, max-age=0` — index.html, the manifest, the service worker and the
 * icons reach the phone on the first open after an update. Only a file that is there gets here: a chunk gone with an
 * update falls through to index.html, which is not kept under the chunk's name.
 */
function webAppCacheHeaders(webAppPath: string): (res: ServerResponse, filePath: string) => void {
  const assetsDir = path.resolve(webAppPath, 'assets') + path.sep;
  return (res, filePath) => {
    if (filePath.startsWith(assetsDir) && CONTENT_HASH_IN_NAME.test(path.basename(filePath))) {
      res.setHeader('Cache-Control', KEEP_FOR_GOOD);
    }
  };
}

/**
 * The HTTP app of the live instance: the API under `/api` and the web app on the root. Built here rather than in
 * `src/index.ts`, so the tests check what the server answers (#272).
 *
 * - No `X-Powered-By: Express`: it tells a scanner what to try and nobody else anything.
 * - No `/webapp/*` redirect any more. It put the rest of the path into `Location`, so `/webapp//evil.example` and
 *   `/webapp/\evil.example` sent the browser to another site from Kapelka's address. The web app moved to the root long
 *   ago: the bot builds its links from the root of `WEB_APP_URL`, and nothing in `src`, `scripts` or `ops` uses the old
 *   path. Such a path is now a page of the web app like any other — its index.html.
 */
export function createHttpApp(api: RequestHandler, webAppPath: string): Express {
  const app = express();
  app.disable('x-powered-by');

  // Trust the first proxy (`tailscale serve`, cloudflared): the rate limits count by the client's address
  // See: https://expressjs.com/en/guide/behind-proxies.html
  app.set('trust proxy', 1);

  app.use('/api', api);

  // The web app on the root; every other path is one of its pages (client-side routes)
  app.use('/', express.static(webAppPath, { setHeaders: webAppCacheHeaders(webAppPath) }));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webAppPath, 'index.html'));
  });

  return app;
}
