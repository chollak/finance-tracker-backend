#!/usr/bin/env node
/*
 * Renders the PNGs of the Kapelka sign (FT-169) from its SVGs in docs/pastel/logo/:
 *
 *   scripts/nvm-exec.sh node scripts/render-sign-png.js
 *
 * Chrome draws each SVG at the exact pixel size, 1x, on the sign's black. The screenshot comes with an alpha channel,
 * so the PNG is written again as 8-bit RGB without it: iOS turns an app icon with alpha black or rejects it.
 * Uses the project's Playwright with its own Chromium; when that one is not downloaded, the installed Google Chrome
 * (or the browser CHROMIUM_PATH names). After a change to the sign: run this, then `npm test -- kapelkaSign`.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const LOGO = 'docs/pastel/logo';
const ICONS = 'webapp/public/icons';
const BLACK = '#141416';

// The square SVG of each place (task FT-169, «где какая форма») and the PNG drawn from it
const TARGETS = [
  { from: `${LOGO}/kapelka-icon.svg`, to: 'ios/Kapelka/Assets.xcassets/AppIcon.appiconset/AppIcon.png', size: 1024 },
  { from: `${LOGO}/kapelka-avatar.svg`, to: `${LOGO}/kapelka-avatar-640.png`, size: 640 },
  { from: `${LOGO}/kapelka-avatar.svg`, to: `${ICONS}/icon-512x512.png`, size: 512 },
  { from: `${LOGO}/kapelka-avatar.svg`, to: `${ICONS}/icon-192x192.png`, size: 192 },
  { from: `${LOGO}/kapelka-avatar.svg`, to: `${ICONS}/apple-touch-icon.png`, size: 180 },
];

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function launch() {
  if (process.env.CHROMIUM_PATH) return chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
    return await chromium.launch();
  } catch (error) {
    if (!fs.existsSync(CHROME)) throw error;
    return chromium.launch({ executablePath: CHROME });
  }
}

function chunksOf(png) {
  const chunks = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    chunks.push({ type: png.toString('ascii', at + 4, at + 8), data: png.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return chunks;
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

/** Undoes the row filters of an 8-bit PNG; returns the rows without their filter bytes. */
function unfilter(raw, width, height, channels) {
  const stride = width * channels;
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? rows[y * stride + x - channels] : 0;
      const up = y > 0 ? rows[(y - 1) * stride + x] : 0;
      const upLeft = x >= channels && y > 0 ? rows[(y - 1) * stride + x - channels] : 0;
      const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];
      rows[y * stride + x] = (line[x] + predictor) & 0xff;
    }
  }
  return rows;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** The same picture as 8-bit RGB: fails if any pixel is not fully opaque. */
function withoutAlpha(png) {
  const chunks = chunksOf(png);
  const ihdr = chunks[0].data;
  const [width, height, bitDepth, colourType] = [ihdr.readUInt32BE(0), ihdr.readUInt32BE(4), ihdr[8], ihdr[9]];
  if (bitDepth !== 8 || ![2, 6].includes(colourType) || ihdr[12] !== 0) {
    throw new Error(`unexpected PNG from Chrome: bit depth ${bitDepth}, colour type ${colourType}, interlace ${ihdr[12]}`);
  }
  const channels = colourType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  const pixels = unfilter(raw, width, height, channels);

  const rgb = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * channels;
      if (channels === 4 && pixels[from + 3] !== 255) throw new Error(`pixel ${x},${y} is not opaque`);
      pixels.copy(rgb, y * (width * 3 + 1) + 1 + x * 3, from, from + 3);
    }
  }
  const header = Buffer.from(ihdr);
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rgb, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function main() {
  const browser = await launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  try {
    for (const { from, to, size } of TARGETS) {
      const svg = fs.readFileSync(path.join(ROOT, from)).toString('base64');
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(
        `<!doctype html><body style="margin:0;background:${BLACK}">` +
          `<img src="data:image/svg+xml;base64,${svg}" width="${size}" height="${size}" style="display:block"></body>`
      );
      await page.locator('img').evaluate((img) => img.decode());
      const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } });
      fs.mkdirSync(path.dirname(path.join(ROOT, to)), { recursive: true });
      fs.writeFileSync(path.join(ROOT, to), withoutAlpha(shot));
      process.stdout.write(`${to}  ${size}×${size}  from ${from}\n`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
