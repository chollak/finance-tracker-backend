import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/**
 * FT-169: the Kapelka sign — two drops of different size joined at their tips into «∞», drawn with the bars of a
 * voice message. One geometry in a 76×38 grid, black and white only; each place puts it on a 100×100 square with its
 * own transform (the task's table «где какая форма»). The PNGs are rendered from the SVGs by
 * scripts/render-sign-png.js. The Mini App's `Wordmark` is checked against the same file in wordmark.test.tsx.
 */

const ROOT = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

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
const PNGS: Array<[file: string, size: number]> = [
  [`${IOS_ICON_SET}/AppIcon.png`, 1024],
  ['docs/pastel/logo/kapelka-avatar-640.png', 640],
  ['webapp/public/icons/icon-192x192.png', 192],
  ['webapp/public/icons/icon-512x512.png', 512],
  ['webapp/public/icons/apple-touch-icon.png', 180],
];

/** IHDR and the first pixel of a PNG: whatever the row filter, the first byte triple of the first row is raw. */
function pngHeader(file: string) {
  const png = fs.readFileSync(path.join(ROOT, file));
  const chunks: Array<{ type: string; data: Buffer }> = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    chunks.push({ type: png.toString('ascii', at + 4, at + 8), data: png.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  const ihdr = chunks[0].data;
  const pixels = zlib.inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  return {
    width: ihdr.readUInt32BE(0),
    height: ihdr.readUInt32BE(4),
    bitDepth: ihdr[8],
    colourType: ihdr[9],
    hasTransparency: chunks.some((c) => c.type === 'tRNS'),
    corner: `#${pixels.subarray(1, 4).toString('hex')}`,
  };
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

  it.each(PNGS)('%s is %ipx square, opaque and black at the edge', (file, size) => {
    const png = pngHeader(file);

    expect({ width: png.width, height: png.height }).toEqual({ width: size, height: size });
    // 8-bit RGB, no alpha channel and no transparent colour: iOS turns an icon with alpha black or rejects it
    expect({ bitDepth: png.bitDepth, colourType: png.colourType, hasTransparency: png.hasTransparency }).toEqual({
      bitDepth: 8,
      colourType: 2,
      hasTransparency: false,
    });
    expect(png.corner).toBe('#141416');
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
    const manifest = JSON.parse(read('webapp/public/manifest.json'));
    const viteConfig = read('webapp/vite.config.ts');
    const pwaIcons = [
      { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ];

    expect(html.match(/<link rel="(icon|apple-touch-icon)"[^>]*>/g)).toEqual([
      '<link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />',
      '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />',
    ]);
    expect(manifest.icons).toEqual(pwaIcons);
    expect(viteConfig.match(/src: '\/icons\/[^']+'/g)).toEqual(pwaIcons.map((icon) => `src: '${icon.src}'`));

    const referenced = [html, JSON.stringify(manifest), viteConfig].join('\n').match(/\/icons\/[\w.-]+/g) ?? [];
    for (const icon of referenced) expect(fs.existsSync(path.join(ROOT, 'webapp/public', icon))).toBe(true);
  });
});
