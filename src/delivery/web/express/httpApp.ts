import express, { Express, RequestHandler } from 'express';
import path from 'path';

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
  app.use('/', express.static(webAppPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webAppPath, 'index.html'));
  });

  return app;
}
