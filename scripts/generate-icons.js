/**
 * Generate placeholder PNG icons for the Chrome extension.
 * Creates simple solid-color icons with a white "AI" letter mark.
 *
 * Usage: node scripts/generate-icons.js
 *
 * Only uses Node.js built-in modules (zlib, fs).
 */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '..', 'icons');

const SIZES = [16, 48, 128];
const COLOR = { r: 74, g: 144, b: 217 }; // #4A90D9 accent blue

/**
 * Generate a minimal valid PNG with a solid color.
 * This creates a simple filled-rectangle PNG.
 */
function createSolidPNG(width, height, r, g, b) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = createChunk('IHDR', (() => {
    const buf = Buffer.alloc(13);
    buf.writeUInt32BE(width, 0);
    buf.writeUInt32BE(height, 4);
    buf[8] = 8;  // bit depth
    buf[9] = 2;  // color type: RGB
    buf[10] = 0; // compression
    buf[11] = 0; // filter
    buf[12] = 0; // interlace
    return buf;
  })());

  // IDAT chunk - raw pixel data (filter byte + RGB bytes per row)
  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 3);
    rawData[rowOffset] = 0; // filter byte: None
    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 3;
      rawData[px] = r;
      rawData[px + 1] = g;
      rawData[px + 2] = b;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC-32 implementation for PNG
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate icons
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

SIZES.forEach((size) => {
  const png = createSolidPNG(size, size, COLOR.r, COLOR.g, COLOR.b);
  const filePath = path.join(ICONS_DIR, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  const fileSize = fs.statSync(filePath).size;
  console.log(`✓ Generated ${filePath} (${fileSize} bytes, ${size}x${size})`);
});

console.log('\nAll icons generated successfully.');
