// A small QR code maker, so the printed guide and the card can carry the app's
// address without a library or a connection.
//
// Scope: text as bytes (UTF-8), error correction level M (about 15% of the code
// can be damaged), versions 1 to 10 (up to 213 bytes). That is far more than a
// web address needs. The method is the standard one (ISO/IEC 18004); the
// layout of this file follows the well-known public-domain reference by
// Project Nayuki.
//
// How it was checked (2026-11-28, on a desktop, not part of the unit tests):
//   - 41 texts across versions 1 to 10 (full, one byte short, half full, nearly
//     empty) were compared module by module with the codes OpenCV's own
//     encoder makes for the same text, version and level. All matched, apart
//     from one of the "remainder" modules in versions 2 to 6: those carry no
//     data, and this file leaves them at zero as the standard says.
//   - The code for the app's address was read back by OpenCV's reader at three
//     sizes, and again rotated and blurred.
// The unit tests pin the code for the app's address, so a later change that
// alters the output is noticed. None of this replaces trying the printed code
// with the phone that will scan it.

const MIN_VERSION = 1;
const MAX_VERSION = 10;

/** Level M, by version (index 0 unused): error-correction bytes per block, and number of blocks. */
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
/** The two format bits that stand for level M. */
const FORMAT_LEVEL_M = 0;

/** How many modules of a version carry data and error correction (everything but the fixed patterns). */
function rawDataModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const aligns = Math.floor(version / 7) + 2;
    result -= (25 * aligns - 10) * aligns - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Bytes of text a version can hold. */
export function qrCapacity(version) {
  const dataBytes = Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[version] * BLOCKS[version];
  const headerBits = 4 + (version < 10 ? 8 : 16);
  return Math.floor((dataBytes * 8 - headerBits) / 8);
}

// --- Reed-Solomon error correction over GF(256) ---

function multiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function divisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = multiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = multiply(root, 2);
  }
  return result;
}

function remainder(data, div) {
  const result = div.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);
    div.forEach((coefficient, i) => {
      result[i] ^= multiply(coefficient, factor);
    });
  }
  return result;
}

// --- text to codewords ---

function dataCodewords(bytes, version) {
  const capacityBits = (Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[version] * BLOCKS[version]) * 8;
  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);
  push(0, Math.min(4, capacityBits - bits.length)); // terminator
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    out.push(byte);
  }
  return out;
}

/** Splits the data into blocks, adds error correction to each, and interleaves them. */
function withErrorCorrection(data, version) {
  const blocks = BLOCKS[version];
  const eccLength = ECC_PER_BLOCK[version];
  const total = Math.floor(rawDataModules(version) / 8);
  const shortBlocks = blocks - (total % blocks);
  const shortLength = Math.floor(total / blocks);
  const div = divisor(eccLength);
  const parts = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const length = shortLength - eccLength + (i < shortBlocks ? 0 : 1);
    const chunk = data.slice(k, k + length);
    k += length;
    const ecc = remainder(chunk, div);
    if (i < shortBlocks) chunk.push(0); // a placeholder, skipped below
    parts.push(chunk.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < parts[0].length; i++) {
    parts.forEach((part, j) => {
      if (i !== shortLength - eccLength || j >= shortBlocks) out.push(part[i]);
    });
  }
  return out;
}

// --- drawing ---

function alignmentPositions(version, size) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function buildGrid(version, codewords) {
  const size = version * 4 + 17;
  const dark = Array.from({ length: size }, () => new Array(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, on) => {
    dark[y][x] = on;
    fixed[y][x] = true;
  };

  // Timing lines.
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // The three corner squares, each with its light surround.
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, ring !== 2 && ring !== 4);
      }
    }
  }
  // The small alignment squares.
  const positions = alignmentPositions(version, size);
  const last = positions.length - 1;
  positions.forEach((cx, i) => {
    positions.forEach((cy, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return; // corner squares are there
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    });
  });
  // The version number, for versions 7 and up.
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const on = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, on);
      set(b, a, on);
    }
  }

  /** The 15 format bits (level and mask), written twice. Also reserves their places. */
  const drawFormat = (mask) => {
    const data = (FORMAT_LEVEL_M << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);

  // The codewords, in the standard zigzag from the bottom-right corner.
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (fixed[y][x] || i >= codewords.length * 8) continue;
        dark[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
        i += 1;
      }
    }
  }

  const applyMask = (mask) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!fixed[y][x] && MASKS[mask](x, y)) dark[y][x] = !dark[y][x];
      }
    }
  };
  return { size, dark, drawFormat, applyMask };
}

/** The standard's score for how hard a pattern is to read: lower is better. */
function penalty(dark, size) {
  let score = 0;
  let darkCount = 0;
  const lines = [];
  for (let y = 0; y < size; y++) lines.push(dark[y]);
  for (let x = 0; x < size; x++) lines.push(dark.map((row) => row[x]));
  for (const line of lines) {
    // Runs of five or more of one colour.
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) {
        run += 1;
      } else {
        if (run >= 5) score += run - 2;
        run = 1;
      }
    }
    // Patterns that look like a corner square.
    const text = line.map((on) => (on ? '1' : '0')).join('');
    for (const pattern of ['10111010000', '00001011101']) {
      for (let at = text.indexOf(pattern); at !== -1; at = text.indexOf(pattern, at + 1)) score += 40;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (dark[y][x]) darkCount += 1;
      // Two-by-two blocks of one colour.
      if (x + 1 < size && y + 1 < size && dark[y][x] === dark[y][x + 1] && dark[y][x] === dark[y + 1][x] && dark[y][x] === dark[y + 1][x + 1]) score += 3;
    }
  }
  // Balance of dark and light.
  const total = size * size;
  score += (Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/**
 * The QR code for a piece of text.
 * @param {string} text
 * @param {{ version?: number, mask?: number }} [force] for tests: a version (1-10) or mask (0-7) to use
 *   instead of the smallest version that fits and the best-scoring mask
 * @returns {{ size: number, version: number, mask: number, modules: boolean[][] }} modules[y][x], true = dark
 */
export function qrMatrix(text, force = {}) {
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  let version = force.version ?? MIN_VERSION;
  while (version <= MAX_VERSION && qrCapacity(version) < bytes.length) version += 1;
  if (!Number.isInteger(version) || version < MIN_VERSION || version > MAX_VERSION) {
    throw new Error(`Too long for a QR code here: ${bytes.length} bytes, and the limit is ${qrCapacity(MAX_VERSION)}`);
  }
  const codewords = withErrorCorrection(dataCodewords(bytes, version), version);
  const grid = buildGrid(version, codewords);

  let mask = force.mask;
  if (mask === undefined) {
    let best = Infinity;
    for (let candidate = 0; candidate < 8; candidate++) {
      grid.applyMask(candidate);
      grid.drawFormat(candidate);
      const score = penalty(grid.dark, grid.size);
      if (score < best) {
        best = score;
        mask = candidate;
      }
      grid.applyMask(candidate); // applying a mask twice removes it
    }
  }
  if (!Number.isInteger(mask) || mask < 0 || mask > 7) throw new Error(`No such mask: ${mask}`);
  grid.applyMask(mask);
  grid.drawFormat(mask);
  return { size: grid.size, version, mask, modules: grid.dark };
}

/**
 * A QR code as an SVG picture: black on white, with the clear margin a reader
 * needs around it (four modules).
 * @param {string} text
 * @param {{ label?: string, quiet?: number }} [options] label: what a screen reader says
 */
export function qrSvg(text, { label = 'QR code', quiet = 4 } = {}) {
  const { size, modules } = qrMatrix(text);
  const full = size + quiet * 2;
  let path = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!modules[y][x]) continue;
      let run = 1;
      while (x + run < size && modules[y][x + run]) run += 1;
      path += `M${x + quiet} ${y + quiet}h${run}v1h-${run}z`;
      x += run - 1;
    }
  }
  const safeLabel = String(label).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return `<svg class="qr" viewBox="0 0 ${full} ${full}" role="img" aria-label="${safeLabel}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="${full}" height="${full}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
