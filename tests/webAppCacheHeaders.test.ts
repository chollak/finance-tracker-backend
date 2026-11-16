import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { telegramAccess } from '../src/shared/domain/access/telegramAccess';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { buildServer } from '../src/delivery/web/express/expressServer';
import { createHttpApp } from '../src/delivery/web/express/httpApp';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * #380: how long a browser keeps a file of the web app. The files Vite names by their content (`assets/*-<hash>.*`)
 * are kept for good; everything else is asked about on every open, as before: index.html, the manifest and the service
 * worker must reach the phone on the first open after an update. The API keeps its `no-store` (#272).
 *
 * The folder mirrors `npm run build:webapp` (`public/webapp`), plus a file in `assets/` without a hash — what Vite
 * would copy there as is from `webapp/public/assets/`.
 */

const FOREVER = 'public, max-age=31536000, immutable';
/** What express.static says by default: the browser asks the server (ETag) before using its copy. */
const ASK_EVERY_TIME = 'public, max-age=0';

const BUILD: Record<string, string> = {
  'index.html': '<!doctype html><title>Kapelka</title><script type="module" src="/assets/index-BLbtmfHV.js"></script>',
  'assets/index-BLbtmfHV.js': 'console.info("kapelka")',
  'assets/index-BR9wcpse.css': 'body{margin:0}',
  'assets/react-vendor-DoJl6UPc.js': 'export {}',
  'assets/manrope-cyrillic-wght-normal-Dvxsihut.woff2': 'font',
  'assets/logo.png': 'png',
  'manifest.webmanifest': '{"name":"Kapelka"}',
  'sw.js': 'self.addEventListener("install", () => {})',
  'registerSW.js': 'navigator.serviceWorker.register("/sw.js")',
  'workbox-bdb082da.js': 'define([], () => {})',
  'icons/icon-192x192.png': 'png',
  'icons/icon.svg': '<svg/>',
};

describe('the cache of the web app’s files (#380)', () => {
  let webAppDir: string;
  let server: LoopbackServer;

  beforeAll(async () => {
    webAppDir = fs.mkdtempSync(path.join(os.tmpdir(), '380-webapp-'));
    for (const [name, content] of Object.entries(BUILD)) {
      fs.mkdirSync(path.dirname(path.join(webAppDir, name)), { recursive: true });
      fs.writeFileSync(path.join(webAppDir, name), content);
    }
    jest.replaceProperty(AppConfig, 'TELEGRAM_ACCESS', telegramAccess([]));
    const api = buildServer(new Proxy({}, { get: () => () => ({}) }) as never);
    server = await listenOnLoopback(createHttpApp(api, webAppDir));
  });

  afterAll(async () => {
    await server.close();
    jest.restoreAllMocks();
    fs.rmSync(webAppDir, { recursive: true, force: true });
  });

  const get = (requestPath: string, method = 'GET') => fetch(`${server.baseUrl}${requestPath}`, { method });

  it.each([
    '/assets/index-BLbtmfHV.js',
    '/assets/index-BR9wcpse.css',
    '/assets/react-vendor-DoJl6UPc.js',
    '/assets/manrope-cyrillic-wght-normal-Dvxsihut.woff2',
  ])('%s, named by its content, is kept for good', async requestPath => {
    const res = await get(requestPath);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(BUILD[requestPath.slice(1)]);
    expect(res.headers.get('cache-control')).toBe(FOREVER);
  });

  it('a HEAD of such a file says the same', async () => {
    const res = await get('/assets/index-BLbtmfHV.js', 'HEAD');

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(FOREVER);
  });

  it.each([
    ['index.html at the root', '/'],
    ['index.html by name', '/index.html'],
    ['a page of the web app (its index.html)', '/settings'],
    ['the manifest', '/manifest.webmanifest'],
    ['the service worker', '/sw.js'],
    ['the service worker’s registration', '/registerSW.js'],
    ['the service worker’s runtime, outside assets/', '/workbox-bdb082da.js'],
    ['an icon', '/icons/icon-192x192.png'],
    ['an svg icon', '/icons/icon.svg'],
    ['a file in assets/ without a hash', '/assets/logo.png'],
  ])('%s is asked about every time', async (_what, requestPath) => {
    const res = await get(requestPath);

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(ASK_EVERY_TIME);
  });

  // A chunk of the version before an update is gone from the build: the answer is index.html, which must not be kept
  // for good under the chunk's name
  it('a hashed name that is not in the build is not kept for good', async () => {
    const res = await get('/assets/page-home-Gone1234.js');

    expect(await res.text()).toContain('<title>Kapelka</title>');
    expect(res.headers.get('cache-control')).toBe(ASK_EVERY_TIME);
  });

  it.each(['/api/health', '/api/does-not-exist', '/api/assets/index-BLbtmfHV.js'])(
    '%s keeps the API’s no-store',
    async requestPath => {
      const res = await get(requestPath);

      expect(res.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate, proxy-revalidate');
    }
  );
});
