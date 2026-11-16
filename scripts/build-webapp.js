#!/usr/bin/env node
/**
 * `npm run build:webapp` (#380): Vite builds the web app into public/webapp.next, then that folder takes the place of
 * public/webapp whole — two renames, nothing copied.
 *
 * The server serves public/webapp all the time. On the live instance the old version keeps running while
 * `scripts/live-update.sh` builds the new one (npm ci → postinstall → this script). Built in place, Vite emptied the
 * folder and wrote it file by file: a phone opening the Mini App then could get a missing or a half-written file, and a
 * file of assets/ is kept for good (Cache-Control immutable, src/delivery/web/express/httpApp.ts). Now every file the
 * server reads is whole, from the old build or the new one. Between the two renames (microseconds) there is no folder,
 * which is a 404, never part of a file. A failed build leaves public/webapp as it was.
 *
 * Same file system on purpose: a rename into another one (a temporary folder in /tmp) is not a rename but a copy.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WEB_APP_SOURCE = path.join(ROOT, 'webapp');
const WEB_APP_BUILD = path.join(ROOT, 'public', 'webapp');

/** Vite's build into `outDir`: the arguments go to `vite build`, the last command of webapp's `npm run build`. */
function viteBuildInto(outDir) {
  const result = spawnSync('npm', ['run', 'build', '--', '--outDir', outDir], {
    cwd: WEB_APP_SOURCE,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`the web app build failed (${result.error?.message ?? `exit ${result.status ?? result.signal}`})`);
  }
}

/** Puts `next` in place of `target`; when the second rename fails, `target` gets its old build back. */
function replaceFolder(target, next) {
  const old = `${target}.old`;
  fs.rmSync(old, { recursive: true, force: true });
  const hadBuild = fs.existsSync(target);
  if (hadBuild) fs.renameSync(target, old);
  try {
    fs.renameSync(next, target);
  } catch (error) {
    if (hadBuild) fs.renameSync(old, target);
    throw error;
  }
  fs.rmSync(old, { recursive: true, force: true });
}

/**
 * Builds with `build(outDir)` into `<target>.next` and puts the result in place of `target` whole. `target` is not
 * touched until the build is complete; a build that fails or writes no index.html leaves it as it was.
 */
function buildInPlaceOf(target, build) {
  const next = `${target}.next`;
  fs.rmSync(next, { recursive: true, force: true });
  try {
    build(next);
    if (!fs.existsSync(path.join(next, 'index.html'))) {
      throw new Error(`the web app build wrote no index.html into ${next}: did --outDir reach vite build?`);
    }
    replaceFolder(target, next);
  } finally {
    fs.rmSync(next, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    buildInPlaceOf(WEB_APP_BUILD, viteBuildInto);
  } catch (error) {
    console.error(`✗ ${error.message}; ${path.relative(process.cwd(), WEB_APP_BUILD)} is as it was`);
    process.exit(1);
  }
}

module.exports = { buildInPlaceOf };
