import { describe, expect, it } from 'vitest';
import { addressForReading, appAddress, LIVE_ADDRESS } from './address.js';
import { CARD_DEFAULTS, CARD_LIMITS, cleanCardText, loadCardText, saveCardText } from './cardText.js';
import { qrCapacity, qrMatrix, qrSvg } from './qr.js';

const rows = (matrix) => matrix.modules.map((row) => row.map((on) => (on ? '1' : '0')).join(''));

/** Reads the level and mask back out of a code's format bits (the copy beside the top-left corner square). */
function readFormat({ modules }) {
  const at = (x, y) => (modules[y][x] ? 1 : 0);
  const places = [];
  for (let i = 0; i <= 5; i++) places.push([8, i]);
  places.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i < 15; i++) places.push([14 - i, 8]);
  let bits = 0;
  places.forEach(([x, y], i) => {
    bits |= at(x, y) << i;
  });
  const data = (bits ^ 0x5412) >>> 10;
  return { level: data >>> 3, mask: data & 7 };
}

describe('qrMatrix', () => {
  it('holds what the standard says level M holds, version by version', () => {
    expect(Array.from({ length: 10 }, (_, i) => qrCapacity(i + 1))).toEqual([14, 26, 42, 62, 84, 106, 122, 152, 180, 213]);
  });

  it('makes the code for the app’s address that was read back by a separate reader', () => {
    // These 29 rows are the code checked on 2026-11-28 (see the note at the top
    // of qr.js). If this test fails, the output changed: check it again with a
    // real reader before changing the rows.
    const code = qrMatrix(LIVE_ADDRESS);
    expect(code).toMatchObject({ version: 3, size: 29, mask: 2 });
    expect(rows(code)).toEqual([
      '11111110000010001011101111111',
      '10000010010010111110101000001',
      '10111010111110101010101011101',
      '10111010101001010110101011101',
      '10111010111111001111101011101',
      '10000010110101110100001000001',
      '11111110101010101010101111111',
      '00000000111010101010000000000',
      '10111110010110000101001111100',
      '10000100001001001111111110001',
      '00110111110001111010011000000',
      '11110100000101010000101101010',
      '00111010011010110100110001100',
      '01100100101010001111101110001',
      '01110111101000010100100111100',
      '00100001000100100000000010010',
      '00101011101100011111010001100',
      '10000000011011111111101110101',
      '10001010000011110100111010100',
      '10101101010101000001100110010',
      '10111110100110111000111110111',
      '00000000100010001110100011111',
      '11111110001110011001101011100',
      '10000010101110111011100010011',
      '10111010111000010100111110100',
      '10111010101111101010110101111',
      '10111010111111011011101111110',
      '10000010000001100000100101010',
      '11111110110110011100011110100',
    ]);
  });

  it('uses the smallest version the text fits in', () => {
    expect(qrMatrix('a'.repeat(14)).version).toBe(1);
    expect(qrMatrix('a'.repeat(15)).version).toBe(2);
    expect(qrMatrix('a'.repeat(213)).version).toBe(10);
    expect(qrMatrix('a').size).toBe(21);
  });

  it('counts bytes, not characters', () => {
    // Fourteen letters fit version 1; seven two-byte letters do too, eight do not.
    expect(qrMatrix('é'.repeat(7)).version).toBe(1);
    expect(qrMatrix('é'.repeat(8)).version).toBe(2);
  });

  it('refuses text that is too long, saying so', () => {
    expect(() => qrMatrix('a'.repeat(214))).toThrow('Too long');
  });

  it('writes the level and the mask it used into the code', () => {
    for (let mask = 0; mask < 8; mask++) {
      expect(readFormat(qrMatrix('LaserRange', { mask }))).toEqual({ level: 0, mask });
    }
    const chosen = qrMatrix('LaserRange');
    expect(readFormat(chosen).mask).toBe(chosen.mask);
  });

  it('draws the three corner squares and the timing lines', () => {
    const { modules, size } = qrMatrix('LaserRange', { version: 4 });
    const square = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
    for (const [left, top] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
      const found = square.map((_, y) => modules[top + y].slice(left, left + 7).map((on) => (on ? '1' : '0')).join(''));
      expect(found).toEqual(square);
    }
    for (let i = 8; i < size - 8; i++) {
      expect(modules[6][i]).toBe(i % 2 === 0);
      expect(modules[i][6]).toBe(i % 2 === 0);
    }
  });

  it('gives the same code every time', () => {
    expect(rows(qrMatrix(LIVE_ADDRESS))).toEqual(rows(qrMatrix(LIVE_ADDRESS)));
  });
});

describe('qrSvg', () => {
  it('leaves a clear margin of four modules and draws only the dark ones', () => {
    const svg = qrSvg(LIVE_ADDRESS);
    expect(svg).toContain('viewBox="0 0 37 37"');
    const { modules } = qrMatrix(LIVE_ADDRESS);
    const dark = modules.flat().filter(Boolean).length;
    const drawn = [...svg.matchAll(/h(\d+)v1/g)].reduce((sum, match) => sum + Number(match[1]), 0);
    expect(drawn).toBe(dark);
    // Nothing is drawn inside the margin.
    expect(svg).not.toMatch(/M[0-3] /);
  });

  it('escapes its label', () => {
    expect(qrSvg('a', { label: 'the "app" <here>' })).toContain('aria-label="the &quot;app&quot; &lt;here&gt;"');
  });
});

describe('appAddress', () => {
  const at = (href) => {
    const url = new URL(href);
    return { protocol: url.protocol, hostname: url.hostname, origin: url.origin, pathname: url.pathname };
  };

  it('prints a published copy’s own address, without a file name or route', () => {
    expect(appAddress(at('https://gtank596.github.io/LaserRange/#/guide'))).toEqual({ address: 'https://gtank596.github.io/LaserRange/', own: true });
    expect(appAddress(at('https://example.org/range/index.html#/card'))).toEqual({ address: 'https://example.org/range/', own: true });
  });

  it('prints the published address from a development copy', () => {
    for (const href of ['http://localhost:5173/#/guide', 'https://localhost:5173/', 'https://192.168.1.20:5173/', 'http://example.org/app/', 'https://10.0.0.5/']) {
      expect(appAddress(at(href))).toEqual({ address: LIVE_ADDRESS, own: false });
    }
    expect(appAddress(undefined)).toEqual({ address: LIVE_ADDRESS, own: false });
  });

  it('shows the address as someone would type it', () => {
    expect(addressForReading(LIVE_ADDRESS)).toBe('gtank596.github.io/LaserRange/');
  });
});

describe('card text', () => {
  const memory = () => {
    const items = new Map();
    return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
  };

  it('starts from the defaults', () => {
    expect(loadCardText(memory())).toEqual(CARD_DEFAULTS);
    expect(loadCardText(null)).toEqual(CARD_DEFAULTS);
  });

  it('keeps what was typed, tidied and clipped to what fits', () => {
    const storage = memory();
    expect(saveCardText({ to: '  Pop  ', message: `two\n lines ${'x'.repeat(200)}`, from: '' }, storage)).toBe(true);
    const text = loadCardText(storage);
    expect(text.to).toBe('Pop');
    expect(text.from).toBe(''); // an empty line stays empty: it is left off the card
    expect(text.message.startsWith('two lines x')).toBe(true);
    expect(text.message).toHaveLength(CARD_LIMITS.message);
  });

  it('falls back to the defaults for anything damaged', () => {
    const storage = memory();
    storage.setItem('laserrange.card.v1', '{not json');
    expect(loadCardText(storage)).toEqual(CARD_DEFAULTS);
    expect(cleanCardText({ to: 5, message: null })).toEqual(CARD_DEFAULTS);
  });

  it('reports when the browser will not store it', () => {
    const refusing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(saveCardText(CARD_DEFAULTS, refusing)).toBe(false);
    expect(saveCardText(CARD_DEFAULTS, null)).toBe(false);
  });
});
