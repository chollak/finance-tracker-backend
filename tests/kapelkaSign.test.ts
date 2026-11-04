import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pwaManifest } from '../webapp/pwaManifest';
import { pastelColors } from '../webapp/src/shared/config/pastelTokens';

interface PngImage {
  width: number;
  height: number;
  bitDepth: number;
  colourType: number;
  chunkTypes: string[];
  channels: number;
  pixels: Buffer;
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readPng }: { readPng: (png: Buffer) => PngImage } = require('../scripts/png-pixels.js');

/**
 * FT-169: the Kapelka sign — two drops of different size joined at their tips into «∞», drawn with the bars of a
 * voice message. One geometry in a 76×38 grid, black and white only; each place puts it on a 100×100 square with its
 * own transform (the task's table «где какая форма»). The PNGs are rendered from the SVGs by
 * scripts/render-sign-png.js. The Mini App's `Wordmark` is checked against the same file in wordmark.test.tsx.
 */

const ROOT = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/**
 * Files under webapp/public: Vite copies the folder into the build as is, so everything here is served. Listed by git,
 * tracked and new alike, minus what .gitignore drops: a `.DS_Store` from Finder is not the project's, and a clone in CI
 * never has one (#217). A tracked file deleted on disk is gone.
 */
function publicFiles() {
  const dir = 'webapp/public/';
  return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', dir], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => file && fs.existsSync(path.join(ROOT, file)))
    .map((file) => file.slice(dir.length))
    .sort();
}

// The task's geometry as Shukur chose it, letter for letter
const BARS =
  '<rect x="1.2" y="10.56" width="5.2" height="16.87" rx="2.6"/><rect x="8.8" y="3.03" width="5.2" height="31.94" rx="2.6"/>' +
  '<rect x="16.4" y="1.01" width="5.2" height="35.97" rx="2.6"/><rect x="24" y="2.13" width="5.2" height="33.75" rx="2.6"/>' +
  '<rect x="31.6" y="6.03" width="5.2" height="25.93" rx="2.6"/><rect x="39.2" y="12.42" width="5.2" height="13.16" rx="2.6"/>' +
  '<rect x="46.8" y="16.4" width="5.2" height="5.2" rx="2.6"/><rect x="54.4" y="12.46" width="5.2" height="13.09" rx="2.6"/>' +
  '<rect x="62" y="9.51" width="5.2" height="18.98" rx="2.6"/><rect x="69.6" y="12.72" width="5.2" height="12.57" rx="2.6"/>';
const SOLID =
  '<path d="M49.4 19C43.17 15.4 34.1 1 19.7 1A18 18 0 0 0 19.7 37C34.1 37 43.17 22.6 49.4 19ZM49.4 19C52.69 17.1 ' +
  '57.48 9.5 65.08 9.5A9.5 9.5 0 0 1 65.08 28.5C57.48 28.5 52.69 20.9 49.4 19Z"/>';
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg"';
const mark = (shape: string) => `${OPEN} viewBox="0 0 76 38" fill="currentColor">${shape}</svg>\n`;
const square = (shape: string, transform: string, corner = '') =>
  `${OPEN} viewBox="0 0 100 100"><rect width="100" height="100"${corner} fill="#141416"/>` +
  `<g transform="${transform}" fill="#fff">${shape}</g></svg>\n`;

const APP_ICON = 'translate(10.48 30.24) scale(1.04)';
const AVATAR = 'translate(15.8 32.9) scale(0.9)';

const IOS_ICON_SET = 'ios/Kapelka/Assets.xcassets/AppIcon.appiconset';
// Each PNG and the transform of the SVG it is drawn from (scripts/render-sign-png.js)
const PNGS: Array<[file: string, size: number, transform: string]> = [
  [`${IOS_ICON_SET}/AppIcon.png`, 1024, APP_ICON],
  ['docs/pastel/logo/kapelka-avatar-640.png', 640, AVATAR],
  ['webapp/public/icons/icon-512x512.png', 512, AVATAR],
  ['webapp/public/icons/icon-192x192.png', 192, AVATAR],
  ['webapp/public/icons/apple-touch-icon.png', 180, AVATAR],
];

const images = new Map<string, PngImage>();
function readImage(file: string) {
  if (!images.has(file)) images.set(file, readPng(fs.readFileSync(path.join(ROOT, file))));
  return images.get(file) as PngImage;
}

/** The bars where `translate(tx ty) scale(k)` puts them on the 100×100 square, in pixels of a `size` image. */
function barsInPixels(transform: string, size: number) {
  const [tx, ty, k] = (transform.match(/[\d.]+/g) ?? []).map(Number);
  const unit = size / 100;
  return [...BARS.matchAll(/x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map((match) => {
    const [x, y, width, height] = match.slice(1).map(Number);
    return {
      left: (tx + x * k) * unit,
      top: (ty + y * k) * unit,
      right: (tx + (x + width) * k) * unit,
      bottom: (ty + (y + height) * k) * unit,
    };
  });
}

describe('the Kapelka sign (FT-169)', () => {
  it('has both forms in docs/pastel/logo with the task geometry, in the text colour', () => {
    expect(read('docs/pastel/logo/kapelka-mark.svg')).toBe(mark(BARS));
    expect(read('docs/pastel/logo/kapelka-mark-solid.svg')).toBe(mark(SOLID));
  });

  it('puts the bars on a square black icon for iOS and on the avatar, each with its own transform', () => {
    expect(read('docs/pastel/logo/kapelka-icon.svg')).toBe(square(BARS, APP_ICON));
    expect(read('docs/pastel/logo/kapelka-avatar.svg')).toBe(square(BARS, AVATAR));
  });

  it('shows the solid silhouette on a rounded black square in the browser tab', () => {
    expect(read('webapp/public/icons/icon.svg')).toBe(square(SOLID, APP_ICON, ' rx="22.5"'));
  });

  it('is black and white only: no colour, no gradient, no shadow', () => {
    const files = ['kapelka-mark', 'kapelka-mark-solid', 'kapelka-icon', 'kapelka-avatar']
      .map((name) => `docs/pastel/logo/${name}.svg`)
      .concat('webapp/public/icons/icon.svg');

    for (const file of files) {
      const svg = read(file);
      expect(svg.match(/fill="[^"]*"/g)?.filter((fill) => !/^fill="(currentColor|#141416|#fff)"$/.test(fill))).toEqual([]);
      expect(svg).not.toMatch(/gradient|filter|shadow|opacity|stroke|<text/i);
    }
  });

  it.each(PNGS)('%s is %ipx square and opaque', (file, size) => {
    const png = readImage(file);

    expect({ width: png.width, height: png.height }).toEqual({ width: size, height: size });
    // 8-bit RGB, no alpha channel and no transparent colour: iOS turns an icon with alpha black or rejects it
    expect({ bitDepth: png.bitDepth, colourType: png.colourType, hasTransparency: png.chunkTypes.includes('tRNS') })
      .toEqual({ bitDepth: 8, colourType: 2, hasTransparency: false });
  });

  // The review of PR #173 found an apple-touch-icon with two squashed copies of the sign: Chrome had shot a frame
  // from before the viewport took the new size. Every pixel is checked against where the transform puts the bars.
  it.each(PNGS)('%s (%ipx, %s): white bar centres, #141416 everywhere else', (file, size, transform) => {
    const png = readImage(file);
    const colourAt = (x: number, y: number) => {
      const at = (Math.floor(y) * png.width + Math.floor(x)) * png.channels;
      return `#${png.pixels.subarray(at, at + 3).toString('hex')}`;
    };
    const bars = barsInPixels(transform, size);

    expect(bars.map((bar) => colourAt((bar.left + bar.right) / 2, (bar.top + bar.bottom) / 2))).toEqual(
      bars.map(() => '#ffffff')
    );

    // Anti-aliasing greys a pixel at most 1px away from a bar's edge; every other pixel is the background
    const nearBar = (x: number, y: number) =>
      bars.some((bar) => x >= bar.left - 1 && x <= bar.right + 1 && y >= bar.top - 1 && y <= bar.bottom + 1);
    const stray: string[] = [];
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        if (!nearBar(x + 0.5, y + 0.5) && colourAt(x, y) !== '#141416') stray.push(`${x},${y} ${colourAt(x, y)}`);
      }
    }
    expect({ strayPixels: stray.length, first: stray.slice(0, 3) }).toEqual({ strayPixels: 0, first: [] });
  });
});

describe('where the sign is used (FT-169)', () => {
  it('iOS: one 1024 universal AppIcon in the app\'s asset catalog, named in Debug and Release', () => {
    expect(JSON.parse(read(`${IOS_ICON_SET}/Contents.json`)).images).toEqual([
      { filename: 'AppIcon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' },
    ]);
    expect(read('ios/Kapelka.xcodeproj/project.pbxproj').match(/ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;/g)).toHaveLength(2);
  });

  it('web: the tab takes icon.svg, the home screen the bars; nothing points at a missing file', () => {
    const html = read('webapp/index.html');
    const manifestIcons = pwaManifest.icons ?? [];

    expect(html.match(/<link rel="(icon|apple-touch-icon)"[^>]*>/g)).toEqual([
      '<link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />',
      '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />',
    ]);
    expect(manifestIcons).toEqual([
      { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ]);

    // The whole manifest, not only `icons`: `shortcuts`, `screenshots` and the like point at files in public/ too
    const referenced =
      [html, read('webapp/vite.config.ts'), JSON.stringify(pwaManifest)].join('\n').match(/\/icons\/[\w.-]+/g) ?? [];
    const shipped = publicFiles();
    for (const icon of referenced) expect([icon, shipped.includes(icon.slice(1))]).toEqual([icon, true]);
  });

  it('web: every asset the service worker precaches is there', () => {
    const patterns = /includeAssets: \[([^\]]*)\]/.exec(read('webapp/vite.config.ts'))?.[1].match(/'[^']+'/g) ?? [];
    const shipped = publicFiles();

    expect(patterns.length).toBeGreaterThan(0);
    for (const pattern of patterns) {
      const glob = new RegExp(`^${pattern.slice(1, -1).replace(/\./g, '\\.').replace(/\*/g, '[^/]*')}$`);
      expect([pattern, shipped.some((file) => glob.test(file))]).toEqual([pattern, true]);
    }
  });
});

// The manifest is an object in webapp/pwaManifest.ts that vite.config.ts hands to VitePWA(): the tests read its
// values, not the text of the config, so the order of keys and blocks there does not matter (#217)
describe('the PWA manifest (FT-257)', () => {
  it('is one: vite-plugin-pwa writes and links it; index.html and public/ have no manifest of their own', () => {
    // The value is this object as it is, not a copy or a spread: a comma or the closing brace right after it
    expect(read('webapp/vite.config.ts')).toMatch(/VitePWA\(\{[\s\S]*\bmanifest\s*:\s*pwaManifest\s*[,}]/);
    expect(read('webapp/index.html')).not.toMatch(/rel="manifest"|manifest\.json/);
    expect(publicFiles().filter((file) => /manifest/i.test(file))).toEqual([]);
  });

  it('takes theme_color and background_color from the light `bg` token of «Пастель», not a copy of it', () => {
    const bg = JSON.parse(read('docs/pastel/tokens.json')).color.tokens.find(
      (token: { name: string }) => token.name === 'bg'
    ).value;
    const source = read('webapp/pwaManifest.ts');

    expect(pastelColors.light.bg).toBe(bg.light);
    expect({ background_color: pwaManifest.background_color, theme_color: pwaManifest.theme_color }).toEqual({
      background_color: bg.light,
      theme_color: bg.light,
    });
    // The values alone would pass with the hex copied in: the colour must come from the generated tokens. A string
    // literal, not any `#…`: an issue number in a comment is not a colour
    expect(source).toContain("import { pastelColors } from './src/shared/config/pastelTokens'");
    expect(source).not.toMatch(/['"`]#[\da-f]{3,8}['"`]/i);
  });

  it('describes Kapelka in Russian', () => {
    expect(pwaManifest.lang).toBe('ru');
    expect(pwaManifest.description).toMatch(/^[А-ЯЁ][а-яё]*( [а-яё]+)+$/);
  });

  it('ships only the icons: no vite.svg left from the template, no README in the build', () => {
    expect(publicFiles()).toEqual([
      'icons/apple-touch-icon.png',
      'icons/icon-192x192.png',
      'icons/icon-512x512.png',
      'icons/icon.svg',
    ]);
    // The icons README lives with the sign's sources, which scripts/render-sign-png.js draws the PNGs from
    expect(fs.existsSync(path.join(ROOT, 'docs/pastel/logo/README.md'))).toBe(true);
  });
});
