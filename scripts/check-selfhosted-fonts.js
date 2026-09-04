#!/usr/bin/env node
/*
 * Self-hosted Onest audit (FT-061).
 *
 * Usage:
 *   npm run check:fonts          # after npm run build:webapp
 *
 * Onest used to be fetched from the Google Fonts CDN on every cold start, so the first screen
 * of the Mini App rendered on system-font metrics the layout is not built for, and the app
 * depended on a third party to draw its own text. This script fails if that comes back.
 *
 * It audits both ends:
 *   1. the webapp source — @font-face rules, weight range, subsets, unicode-range, font-display,
 *      and no CDN reference anywhere under webapp/src or in index.html;
 *   2. the built bundle Express actually serves — no CDN reference, and the Onest woff2 files
 *      present and referenced by the built CSS.
 *
 * This lives in Node rather than a Vitest test because Vitest does not process CSS by default,
 * so `import css from './fonts.css?raw'` yields an empty string and the assertions pass on
 * nothing. Plain fs reads have no such trap.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WEBAPP_SRC = path.join(ROOT, 'webapp', 'src');
const INDEX_HTML = path.join(ROOT, 'webapp', 'index.html');
const FONTS_CSS = path.join(WEBAPP_SRC, 'app', 'styles', 'fonts.css');
const GLOBALS_CSS = path.join(WEBAPP_SRC, 'app', 'styles', 'globals.css');
const BUILD_DIR = path.join(ROOT, 'public', 'webapp');

// Assembled from parts so this file does not trip its own search.
const CDN_HOSTS = ['fonts.google' + 'apis.com', 'fonts.gsta' + 'tic.com'];
const TEXT_EXTENSIONS = ['.html', '.css', '.js', '.json', '.webmanifest'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.css', '.html', '.json'];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

function read(file) {
  if (!fs.existsSync(file)) {
    fail(`${path.relative(ROOT, file)} not found.`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

function assertSetEqual(label, actual, expected) {
  const a = [...actual].sort();
  const b = [...expected].sort();
  if (a.length !== b.length || a.some((value, i) => value !== b[i])) {
    fail(`${label}: expected [${b.join(', ')}], found [${a.join(', ')}]`);
  }
}

/* ---------------------------------------------------------------- source */

// The rationale for the subsets, weights and font-display lives in a comment at the top of
// fonts.css and names those same properties, so strip comments before matching rules.
const fontsCss = read(FONTS_CSS).replace(/\/\*[\s\S]*?\*\//g, '');
const globalsCss = read(GLOBALS_CSS);
const indexHtml = read(INDEX_HTML);

for (const host of CDN_HOSTS) {
  if (indexHtml.includes(host)) {
    fail(`webapp/index.html references ${host}`);
  }
}

const sourceFiles = walk(WEBAPP_SRC).filter((f) => SOURCE_EXTENSIONS.includes(path.extname(f)));
if (sourceFiles.length === 0) {
  fail('no webapp source files scanned — check the paths in this script.');
}
for (const file of sourceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const host of CDN_HOSTS) {
    if (content.includes(host)) {
      fail(`${path.relative(ROOT, file)} references ${host}`);
    }
  }
}

if (!globalsCss.includes('@import "./fonts.css"')) {
  fail('globals.css does not @import "./fonts.css" — the @font-face rules never load.');
}

const sansToken = globalsCss.match(/--font-family-sans:\s*([^;]+);/)?.[1];
if (!sansToken) {
  fail('globals.css has no --font-family-sans token.');
} else if (!/^'Onest',/.test(sansToken.trim()) || !sansToken.includes('system-ui')) {
  fail(`--font-family-sans should start with 'Onest', and keep a system-ui fallback: ${sansToken.trim()}`);
}

const faceCount = [...fontsCss.matchAll(/@font-face/g)].length;
if (faceCount === 0) {
  fail('fonts.css declares no @font-face — the font is not self-hosted.');
}

const sources = [...fontsCss.matchAll(/src:\s*url\('([^']+)'\)/g)].map((m) => m[1]);
if (sources.length === 0) {
  fail('fonts.css has no src: url(...) — nothing is served from our own bundle.');
}
for (const source of sources) {
  if (!/^@fontsource-variable\/onest\/files\/.+\.woff2$/.test(source)) {
    fail(`fonts.css src should resolve through the npm package, not an absolute URL: ${source}`);
  }
}

const families = new Set([...fontsCss.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]));
assertSetEqual('fonts.css @font-face families', families, ['Onest']);

// The design system uses 400/500/600/700/800. A variable font carries the whole 100-900 axis,
// so the declared range is what pins the app to the weights it uses.
const weights = new Set([...fontsCss.matchAll(/font-weight:\s*([^;]+);/g)].map((m) => m[1].trim()));
assertSetEqual('fonts.css declared weight ranges', weights, ['400 800']);

// Only the subsets the Russian/UZS UI actually renders are shipped. Adding one is a deliberate
// call about bundle size, so it should show up in a diff on this check.
const subsets = new Set(
  [...fontsCss.matchAll(/files\/onest-([a-z-]+)-wght-normal\.woff2/g)].map((m) => m[1])
);
assertSetEqual('fonts.css subsets', subsets, ['cyrillic', 'latin']);

// A missing font-display silently falls back to `auto`, which is `block` in Chrome and hides
// text on a slow first paint.
const swapCount = [...fontsCss.matchAll(/font-display:\s*swap;/g)].length;
if (faceCount > 0 && swapCount !== faceCount) {
  fail(`font-display: swap is set on ${swapCount} of ${faceCount} @font-face rules.`);
}

const rangeCount = [...fontsCss.matchAll(/unicode-range:/g)].length;
if (faceCount > 0 && rangeCount !== faceCount) {
  fail(`unicode-range is set on ${rangeCount} of ${faceCount} @font-face rules — subsets stop downloading lazily.`);
}

/* ----------------------------------------------------------------- build */

if (!fs.existsSync(BUILD_DIR)) {
  console.error(`✗ ${path.relative(process.cwd(), BUILD_DIR)} not found — run npm run build:webapp first.`);
  process.exit(1);
}

const files = walk(BUILD_DIR);

for (const file of files.filter((f) => TEXT_EXTENSIONS.includes(path.extname(f)))) {
  const content = fs.readFileSync(file, 'utf8');
  for (const host of CDN_HOSTS) {
    if (content.includes(host)) {
      fail(`${path.relative(BUILD_DIR, file)} still references ${host}`);
    }
  }
}

const fontFiles = files.filter((f) => /onest-.*\.woff2$/.test(path.basename(f)));
if (fontFiles.length === 0) {
  fail('no Onest woff2 files in the build — the font is not self-hosted.');
}

const cssFiles = files.filter((f) => path.extname(f) === '.css');
for (const font of fontFiles) {
  const name = path.basename(font);
  const referenced = cssFiles.some((css) => fs.readFileSync(css, 'utf8').includes(name));
  if (!referenced) {
    fail(`${name} is shipped but no built CSS references it.`);
  }
}

if (process.exitCode) {
  process.exit(1);
}

const totalBytes = fontFiles.reduce((sum, f) => sum + fs.statSync(f).size, 0);
const detail = fontFiles
  .map((f) => `${path.basename(f)} (${(fs.statSync(f).size / 1024).toFixed(1)} KB)`)
  .sort()
  .join(', ');

console.log(`✓ Onest source audit passed: ${faceCount} @font-face, subsets ${[...subsets].sort().join(' + ')}, weight 400 800, font-display swap.`);
console.log(`✓ Onest is self-hosted: ${fontFiles.length} file(s), ${(totalBytes / 1024).toFixed(1)} KB total.`);
console.log(`  ${detail}`);
console.log('✓ No Google Fonts CDN references in the webapp source or build output.');
