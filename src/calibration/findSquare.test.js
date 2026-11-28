import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../simulation/sceneSynth.js';
import { convexHull, findTargetSquare, orderCorners } from './findSquare.js';
import { applyHomography, computeHomography } from './homography.js';

const WIDTH = 480;
const HEIGHT = 640;
const UNIT = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/**
 * Draws the printed sheet as a camera would see it, given where the square's
 * four corners fall in the picture (pixels: top-left, then clockwise).
 * style: 'border' (the real sheet), 'outline' (a hairline square, as on the
 * earlier sheet), 'solid' (a filled black square), 'none' (blank paper).
 */
function drawSheet({
  corners,
  style = 'border',
  background = 70,
  paper = 215,
  ink = 35,
  paperMargin = 12 / 180,
  noise = 0,
  light = () => 1,
  width = WIDTH,
  height = HEIGHT,
}) {
  const toUnit = computeHomography(corners, UNIT);
  const random = mulberry32(7);
  const f = 5 / 180;
  const hair = 0.8 / 180;
  const shade = (x, y) => {
    const { x: u, y: v } = applyHomography(toUnit, x, y);
    if (u < -paperMargin || v < -paperMargin || u > 1 + paperMargin || v > 1 + paperMargin) return background;
    if (style === 'none') return paper;
    const inSquare = u >= 0 && v >= 0 && u <= 1 && v <= 1;
    const edge = Math.min(u, v, 1 - u, 1 - v); // distance in from the square's edge
    if (style === 'solid') return inSquare ? ink : paper;
    if (style === 'border' && inSquare && edge < f) return ink;
    if (style === 'outline' && inSquare && edge < hair) return ink;
    // Ten thin rings, as printed.
    const r = Math.hypot(u - 0.5, v - 0.5);
    for (let k = 1; k <= 10; k++) if (Math.abs(r - (k * 8) / 180) < 0.2 / 180) return 80;
    return paper;
  };
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Four samples per pixel, so edges blur the way a lens blurs them.
      const value = (shade(x + 0.25, y + 0.25) + shade(x + 0.75, y + 0.25) + shade(x + 0.25, y + 0.75) + shade(x + 0.75, y + 0.75)) / 4;
      const lit = value * light(x / width, y / height) + (random() - 0.5) * 2 * noise;
      const p = (y * width + x) * 4;
      rgba[p] = rgba[p + 1] = rgba[p + 2] = lit;
      rgba[p + 3] = 255;
    }
  }
  return rgba;
}

const squareOn = [
  { x: 120, y: 200 },
  { x: 360, y: 200 },
  { x: 360, y: 440 },
  { x: 120, y: 440 },
];
// Seen from the left and a little below, and tilted: no two sides parallel.
const angled = [
  { x: 138, y: 215 },
  { x: 352, y: 188 },
  { x: 371, y: 452 },
  { x: 121, y: 418 },
];

/** Largest distance, in pixels, between found corners and true ones. */
function worstError(result, truth, width = WIDTH, height = HEIGHT) {
  return Math.max(...result.corners.map((corner, i) => Math.hypot(corner.x * width - truth[i].x, corner.y * height - truth[i].y)));
}

describe('findTargetSquare', () => {
  it('finds the border seen square-on, to within a pixel', () => {
    const result = findTargetSquare(drawSheet({ corners: squareOn }), WIDTH, HEIGHT);
    expect(result.found).toBe(true);
    expect(worstError(result, squareOn)).toBeLessThan(1);
  });

  it('finds it seen at an angle, corners in the app’s order', () => {
    const result = findTargetSquare(drawSheet({ corners: angled }), WIDTH, HEIGHT);
    expect(result.found).toBe(true);
    expect(worstError(result, angled)).toBeLessThan(1.5);
  });

  it('copes with camera noise', () => {
    const result = findTargetSquare(drawSheet({ corners: angled, noise: 8 }), WIDTH, HEIGHT);
    expect(result.found).toBe(true);
    expect(worstError(result, angled)).toBeLessThan(1.5);
  });

  it('copes with light falling off across the room', () => {
    const light = (x, y) => 0.55 + 0.5 * x + 0.1 * y;
    const result = findTargetSquare(drawSheet({ corners: angled, light }), WIDTH, HEIGHT);
    expect(result.found).toBe(true);
    expect(worstError(result, angled)).toBeLessThan(1.5);
  });

  it('finds it on a wall nearly as light as the paper', () => {
    const result = findTargetSquare(drawSheet({ corners: angled, background: 200 }), WIDTH, HEIGHT);
    expect(result.found).toBe(true);
    expect(worstError(result, angled)).toBeLessThan(1.5);
  });

  it('finds it on a very dark wall, and is not fooled by the paper’s own edge', () => {
    const result = findTargetSquare(drawSheet({ corners: angled, background: 15 }), WIDTH, HEIGHT);
    expect(result.found).toBe(true);
    expect(worstError(result, angled)).toBeLessThan(1.5);
  });

  it('finds a dim, low-contrast print', () => {
    const result = findTargetSquare(drawSheet({ corners: angled, paper: 120, ink: 55, background: 40, noise: 4 }), WIDTH, HEIGHT);
    expect(result.found).toBe(true);
    expect(worstError(result, angled)).toBeLessThan(1.5);
  });

  it('finds a square that is small in the picture', () => {
    const small = [
      { x: 200, y: 280 },
      { x: 272, y: 276 },
      { x: 276, y: 350 },
      { x: 198, y: 352 },
    ];
    const result = findTargetSquare(drawSheet({ corners: small }), WIDTH, HEIGHT);
    expect(result.found).toBe(true);
    expect(worstError(result, small)).toBeLessThan(1.5);
  });

  it('keeps top-left first when the sheet is turned', () => {
    // The sheet rotated about 20 degrees clockwise.
    const turned = [
      { x: 168, y: 190 },
      { x: 372, y: 264 },
      { x: 298, y: 468 },
      { x: 94, y: 394 },
    ];
    const result = findTargetSquare(drawSheet({ corners: turned }), WIDTH, HEIGHT);
    expect(result.found).toBe(true);
    expect(worstError(result, turned)).toBeLessThan(1.5);
  });

  it('reports how big the square is in the picture', () => {
    const result = findTargetSquare(drawSheet({ corners: squareOn }), WIDTH, HEIGHT);
    expect(result.sidePx).toBeGreaterThan(238);
    expect(result.sidePx).toBeLessThan(242);
  });

  describe('things that are not the printed border', () => {
    it('finds nothing on a blank wall', () => {
      const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4).fill(128);
      expect(findTargetSquare(rgba, WIDTH, HEIGHT).found).toBe(false);
    });

    it('does not take a blank sheet of paper for the target', () => {
      expect(findTargetSquare(drawSheet({ corners: angled, style: 'none' }), WIDTH, HEIGHT).found).toBe(false);
      expect(findTargetSquare(drawSheet({ corners: angled, style: 'none', background: 15 }), WIDTH, HEIGHT).found).toBe(false);
    });

    it('does not take a solid black square for the target', () => {
      expect(findTargetSquare(drawSheet({ corners: angled, style: 'solid' }), WIDTH, HEIGHT).found).toBe(false);
    });

    it('does not accept the earlier sheet, which had only a hairline square', () => {
      expect(findTargetSquare(drawSheet({ corners: angled, style: 'outline' }), WIDTH, HEIGHT).found).toBe(false);
    });

    it('does not guess when part of the border is out of the picture', () => {
      const cut = squareOn.map((p) => ({ x: p.x + 150, y: p.y }));
      expect(findTargetSquare(drawSheet({ corners: cut }), WIDTH, HEIGHT).found).toBe(false);
    });

    it('does not guess when something covers one side of the border', () => {
      const rgba = drawSheet({ corners: squareOn });
      // A light strip (a hand, a piece of tape) across the whole left side.
      for (let y = 180; y < 460; y++) {
        for (let x = 105; x < 135; x++) {
          const p = (y * WIDTH + x) * 4;
          rgba[p] = rgba[p + 1] = rgba[p + 2] = 190;
        }
      }
      expect(findTargetSquare(rgba, WIDTH, HEIGHT).found).toBe(false);
    });
  });
});

describe('orderCorners', () => {
  it('starts top-left and goes clockwise as seen in the picture', () => {
    const shuffled = [squareOn[2], squareOn[0], squareOn[3], squareOn[1]];
    expect(orderCorners(shuffled)).toEqual(squareOn);
  });
});

describe('convexHull', () => {
  it('drops points inside the shape and on its edges', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
      { x: 2, y: 2 },
      { x: 2, y: 0 },
    ]);
    expect(hull).toHaveLength(4);
  });
});
