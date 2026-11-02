/*
 * Reads and writes the plain PNGs of the Kapelka sign (FT-169): 8-bit RGB or RGBA, not interlaced. One copy for
 * scripts/render-sign-png.js, which drops the alpha channel of Chrome's screenshot, and for tests/kapelkaSign.test.ts,
 * which compares every pixel with the sign's geometry.
 */

const zlib = require('zlib');

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunksOf(png) {
  const chunks = [];
  for (let at = SIGNATURE.length; at < png.length; ) {
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

/**
 * What the header of a PNG says and its pixels, row by row, `channels` bytes a pixel (3 for RGB, 4 for RGBA).
 * `chunkTypes` lists every chunk, so a caller sees a `tRNS` transparency.
 */
function readPng(png) {
  if (!png.subarray(0, SIGNATURE.length).equals(SIGNATURE)) throw new Error('not a PNG');
  const chunks = chunksOf(png);
  const ihdr = chunks[0].data;
  const image = {
    width: ihdr.readUInt32BE(0),
    height: ihdr.readUInt32BE(4),
    bitDepth: ihdr[8],
    colourType: ihdr[9],
    interlace: ihdr[12],
    chunkTypes: chunks.map((chunk) => chunk.type),
  };
  if (image.bitDepth !== 8 || ![2, 6].includes(image.colourType) || image.interlace !== 0) {
    throw new Error(`only 8-bit RGB or RGBA, not interlaced: depth ${image.bitDepth}, colour type ${image.colourType}`);
  }
  const channels = image.colourType === 6 ? 4 : 3;
  const data = chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data);
  const raw = zlib.inflateSync(Buffer.concat(data));
  return { ...image, channels, pixels: unfilter(raw, image.width, image.height, channels) };
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** An 8-bit RGB PNG of `rgb`: 3 bytes a pixel, row by row. */
function writeRgbPng(width, height, rgb) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) rgb.copy(rows, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { readPng, writeRgbPng };
