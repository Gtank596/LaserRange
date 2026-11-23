// Generates the PNG app icons with no dependencies (iOS needs PNG, not SVG,
// for the home-screen icon). Run with: npm run icons
// The design mirrors public/icons/icon.svg: two mint rings and an amber centre
// on the app background, kept inside the maskable-icon safe zone.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG = [0x10, 0x18, 0x20];
const MINT = [0x63, 0xd4, 0xaf];
const AMBER = [0xf3, 0xa6, 0x5e];

/** Colour of the icon at a point, in a 512-unit design space. */
function colourAt(x, y) {
  const d = Math.hypot(x - 256, y - 256);
  if (d <= 34) return AMBER;
  if (Math.abs(d - 92) <= 10 || Math.abs(d - 150) <= 10) return MINT;
  return BG;
}

function render(size) {
  const SS = 4; // supersampling per axis for smooth edges
  const scale = 512 / size;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let py = 0; py < size; py++) {
    raw[o++] = 0; // PNG filter type: none
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colourAt((px + (sx + 0.5) / SS) * scale, (py + (sy + 0.5) / SS) * scale);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS;
      raw[o++] = Math.round(r / n);
      raw[o++] = Math.round(g / n);
      raw[o++] = Math.round(b / n);
      raw[o++] = 255;
    }
  }
  return encodePng(size, size, raw);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(outDir, { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(join(outDir, name), render(size));
  console.log(`wrote public/icons/${name} (${size}x${size})`);
}
