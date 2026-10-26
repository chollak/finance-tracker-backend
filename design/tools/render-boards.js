#!/usr/bin/env node
/**
 * Renders canvas boards (.dc.html) to PNG with the canvas runtime, the way the canvas shows them.
 *
 *   node render-boards.js --site=<dir> --out=<dir> --fonts=<dir> [--report=<file.json>] [Name ...]
 *
 * <site>  folder with the boards (*.dc.html) and the runtime saved as support.js
 * <fonts> the @fontsource-variable/manrope package folder — Google Fonts requests are answered from
 *         it, so the render needs no network and uses the same Manrope build as the webapp
 * Names   board file names without .dc.html; none = every board in <site>
 * Each board is shot at its $preview size (data-props), 1x.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);
const site = path.resolve(arg('site'));
const out = path.resolve(arg('out'));
const fonts = path.resolve(arg('fonts'));
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));

function previewSize(file) {
  const html = fs.readFileSync(file, 'utf8');
  const m = /data-props='([^']*)'/.exec(html);
  if (m) {
    try {
      const props = JSON.parse(m[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
      if (props.$preview) return { width: props.$preview.width, height: props.$preview.height };
    } catch { /* fall through */ }
  }
  return { width: 390, height: 844 };
}

function serve(port0 = 0) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2', '.css': 'text/css' };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = url.startsWith('/__fonts/') ? path.join(fonts, 'files', path.basename(url)) : path.join(site, path.normalize(url));
    if (!file.startsWith(site) && !file.startsWith(fonts)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, body) => {
      if (error) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }).end(body);
    });
  });
  return new Promise((resolve) => server.listen(port0, '127.0.0.1', () => resolve(server)));
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const boards = names.length ? names : fs.readdirSync(site).filter((f) => f.endsWith('.dc.html')).map((f) => f.slice(0, -8)).sort();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  // The webapp's own Manrope build under the family name the boards ask Google Fonts for
  const fontCss = fs.readFileSync(path.join(fonts, 'wght.css'), 'utf8')
    .replace(/'Manrope Variable'/g, "'Manrope'")
    .replace(/font-display: swap/g, 'font-display: block')
    .replace(/url\(\.\/files\//g, `url(${base}/__fonts/`);

  // CHROMIUM_PATH: a preinstalled Chromium when Playwright's own build is not downloaded
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const context = await browser.newContext({ deviceScaleFactor: 1, locale: 'ru-RU', timezoneId: 'Asia/Tashkent' });
  await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: fontCss }));
  await context.route('https://fonts.gstatic.com/**', (route) => route.abort());
  const external = new Set();
  context.on('request', (request) => { const u = request.url(); if (!u.startsWith(base) && !u.startsWith('data:')) external.add(u.split('?')[0]); });

  const report = [];
  for (const name of boards) {
    const file = path.join(site, `${name}.dc.html`);
    if (!fs.existsSync(file)) { report.push({ name, error: 'no such board' }); continue; }
    const size = previewSize(file);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setViewportSize(size);
    await page.goto(`${base}/${encodeURIComponent(name)}.dc.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => {
      const root = document.getElementById('dc-root');
      return root && root.querySelector('*') && document.fonts.status === 'loaded';
    }, null, { timeout: 15000 }).catch(() => errors.push('timed out waiting for the board to render'));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200); // entrance animations (300 ms + stagger) settle
    await page.screenshot({ path: path.join(out, `${name}.png`), clip: { x: 0, y: 0, ...size } });
    report.push({ name, size: `${size.width}x${size.height}`, errors });
    await page.close();
  }
  await browser.close();
  server.close();
  if (arg('report')) fs.writeFileSync(path.resolve(arg('report')), JSON.stringify({ external: [...external], boards: report }, null, 2));
  const failed = report.filter((r) => r.error || (r.errors && r.errors.length));
  console.log(`rendered ${report.length - report.filter((r) => r.error).length}/${boards.length}; with errors: ${failed.length}; external requests: ${[...external].join(', ') || 'none'}`);
  for (const r of failed) console.log(`  ${r.name}: ${r.error || r.errors.slice(0, 3).join(' | ')}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
