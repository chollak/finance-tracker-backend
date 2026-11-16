import fs from 'fs';
import os from 'os';
import path from 'path';

type Build = (outDir: string) => void;
const { buildInPlaceOf }: { buildInPlaceOf: (target: string, build: Build) => void } = require('../scripts/build-webapp.js');

/**
 * #380: `npm run build:webapp` — the step `live-update.sh` runs through `npm ci` while the old server keeps serving
 * public/webapp — builds beside the folder and puts the build in its place whole. The server never reads a file Vite is
 * still writing: a file of assets/ is kept by the phone for good, a cut one would stay broken.
 */

type Files = Record<string, string>;

const OLD_BUILD: Files = { 'index.html': 'old index', 'assets/index-Old11111.js': 'old chunk' };
const NEW_BUILD: Files = { 'index.html': 'new index', 'assets/index-New22222.js': 'new chunk', 'sw.js': 'new sw' };

function writeBuild(dir: string, files: Files): void {
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
}

/** Every file under `dir` by its path inside it. */
function filesOf(dir: string): Files {
  const entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile());
  return Object.fromEntries(entries.map(entry => {
    const file = path.join(entry.parentPath, entry.name);
    return [path.relative(dir, file).split(path.sep).join('/'), fs.readFileSync(file, 'utf8')];
  }));
}

describe('npm run build:webapp puts a complete build in place of public/webapp (#380)', () => {
  let publicDir: string;
  let target: string;
  /** What is in public/ besides webapp/: a build leaves nothing there. */
  const besideTarget = () => fs.readdirSync(publicDir).filter(name => name !== 'webapp');

  beforeEach(() => {
    publicDir = fs.mkdtempSync(path.join(os.tmpdir(), '380-public-'));
    target = path.join(publicDir, 'webapp');
    writeBuild(target, OLD_BUILD);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(publicDir, { recursive: true, force: true });
  });

  it('the new build takes the old one’s place whole: an old chunk is gone, nothing is left beside it', () => {
    buildInPlaceOf(target, outDir => writeBuild(outDir, NEW_BUILD));

    expect(filesOf(target)).toEqual(NEW_BUILD);
    expect(besideTarget()).toEqual([]);
  });

  it('while Vite writes, it writes beside public/webapp, and public/webapp is the old build untouched', () => {
    let servedMeanwhile: Files = {};

    buildInPlaceOf(target, outDir => {
      expect(path.dirname(outDir)).toBe(publicDir);
      expect(outDir).not.toBe(target);
      writeBuild(outDir, { 'assets/index-New22222.js': 'new ch' });
      servedMeanwhile = filesOf(target);
      writeBuild(outDir, NEW_BUILD);
    });

    expect(servedMeanwhile).toEqual(OLD_BUILD);
    expect(filesOf(target)).toEqual(NEW_BUILD);
  });

  it('a build that fails leaves public/webapp as it was, and nothing beside it', () => {
    const failing: Build = outDir => {
      writeBuild(outDir, { 'assets/index-Half3333.js': 'half a chu' });
      throw new Error('vite build failed');
    };

    expect(() => buildInPlaceOf(target, failing)).toThrow('vite build failed');
    expect(filesOf(target)).toEqual(OLD_BUILD);
    expect(besideTarget()).toEqual([]);
  });

  // The arguments did not reach `vite build` (webapp's `build` script changed): Vite wrote somewhere else
  it('a build that wrote no index.html replaces nothing', () => {
    expect(() => buildInPlaceOf(target, outDir => writeBuild(outDir, { 'assets/index-New22222.js': 'new chunk' })))
      .toThrow(/no index\.html/);
    expect(filesOf(target)).toEqual(OLD_BUILD);
    expect(besideTarget()).toEqual([]);
  });

  it('the first build, with no public/webapp yet', () => {
    fs.rmSync(target, { recursive: true });

    buildInPlaceOf(target, outDir => writeBuild(outDir, NEW_BUILD));

    expect(filesOf(target)).toEqual(NEW_BUILD);
    expect(besideTarget()).toEqual([]);
  });

  it('what an interrupted build left beside public/webapp does not get into the next one', () => {
    writeBuild(`${target}.next`, { 'index.html': 'stale', 'assets/index-Stale444.js': 'stale chunk' });
    writeBuild(`${target}.old`, OLD_BUILD);

    buildInPlaceOf(target, outDir => writeBuild(outDir, NEW_BUILD));

    expect(filesOf(target)).toEqual(NEW_BUILD);
    expect(besideTarget()).toEqual([]);
  });

  it('a build that cannot be put in place gives public/webapp its old build back', () => {
    const rename = fs.renameSync;
    jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(from).endsWith('.next')) throw Object.assign(new Error('EXDEV: cross-device link'), { code: 'EXDEV' });
      rename(from, to);
    });

    expect(() => buildInPlaceOf(target, outDir => writeBuild(outDir, NEW_BUILD))).toThrow('EXDEV');
    expect(filesOf(target)).toEqual(OLD_BUILD);
    expect(besideTarget()).toEqual([]);
  });

  // live-update.sh builds the web app through npm ci: postinstall → build:webapp
  it('is what build:webapp, and so postinstall, runs', () => {
    const { scripts } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

    expect(scripts['build:webapp']).toBe('node scripts/build-webapp.js');
    expect(scripts.postinstall).toContain('npm run build:webapp');
  });
});
