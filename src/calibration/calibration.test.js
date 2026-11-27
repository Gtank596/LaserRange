import { describe, expect, it } from 'vitest';
import { buildRoiMask, createMapper, validateCorners } from './calibration.js';
import { applyHomography, computeHomography, invertHomography, isConvexQuad, pointInQuad, signedArea } from './homography.js';
import { scoreHit } from './scoring.js';
import { getTarget, printableTargetSvg, ringShare, sheetSizeMm } from './targets.js';

const SQUARE = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

// A made-up but realistic camera view: the square seen off-centre and at an
// angle, so its far edge appears shorter than its near edge.
const TRUE_VIEW = [0.52, 0.07, 0.21, -0.05, 0.61, 0.18, 0.09, -0.14, 1];
const seenAt = (u, v) => applyHomography(TRUE_VIEW, u, v);
const SEEN_CORNERS = SQUARE.map((p) => seenAt(p.x, p.y));

describe('homography', () => {
  it('maps a square onto itself with the identity', () => {
    const H = computeHomography(SQUARE, SQUARE);
    expect(applyHomography(H, 0.3, 0.8).x).toBeCloseTo(0.3, 12);
    expect(applyHomography(H, 0.3, 0.8).y).toBeCloseTo(0.8, 12);
  });

  it('recovers known positions on the square from a perspective view', () => {
    const toSquare = computeHomography(SEEN_CORNERS, SQUARE);
    for (const [u, v] of [[0.5, 0.5], [0.1, 0.9], [0.75, 0.2], [0.33, 0.66], [0.95, 0.95]]) {
      const seen = seenAt(u, v);
      const back = applyHomography(toSquare, seen.x, seen.y);
      expect(back.x).toBeCloseTo(u, 9);
      expect(back.y).toBeCloseTo(v, 9);
    }
  });

  it('shows that perspective is not a simple stretch (the centre of the picture shape is not the centre of the square)', () => {
    const averageOfCorners = {
      x: SEEN_CORNERS.reduce((sum, p) => sum + p.x, 0) / 4,
      y: SEEN_CORNERS.reduce((sum, p) => sum + p.y, 0) / 4,
    };
    const trueCentre = seenAt(0.5, 0.5);
    expect(Math.hypot(averageOfCorners.x - trueCentre.x, averageOfCorners.y - trueCentre.y)).toBeGreaterThan(0.005);
  });

  it('inverts cleanly', () => {
    const H = computeHomography(SEEN_CORNERS, SQUARE);
    const back = invertHomography(H);
    const p = applyHomography(H, 0.6, 0.4);
    const q = applyHomography(back, p.x, p.y);
    expect(q.x).toBeCloseTo(0.6, 9);
    expect(q.y).toBeCloseTo(0.4, 9);
  });

  it('returns null for corners that cannot define a view', () => {
    const inALine = [{ x: 0, y: 0 }, { x: 0.3, y: 0.3 }, { x: 0.6, y: 0.6 }, { x: 0, y: 1 }];
    expect(computeHomography(inALine, SQUARE)).toBeNull();
  });

  it('classifies shapes', () => {
    expect(isConvexQuad(SQUARE)).toBe(true);
    expect(signedArea(SQUARE)).toBeCloseTo(1, 12);
    const bowTie = [SQUARE[0], SQUARE[1], SQUARE[3], SQUARE[2]];
    expect(isConvexQuad(bowTie)).toBe(false);
    expect(pointInQuad(SQUARE, 0.5, 0.5)).toBe(true);
    expect(pointInQuad(SQUARE, 1.2, 0.5)).toBe(false);
  });
});

describe('validateCorners', () => {
  it('accepts a sensible view', () => {
    expect(validateCorners(SEEN_CORNERS)).toEqual({ ok: true });
  });

  it('rejects crossed, reversed and tiny shapes with a reason', () => {
    const bowTie = [SEEN_CORNERS[0], SEEN_CORNERS[1], SEEN_CORNERS[3], SEEN_CORNERS[2]];
    expect(validateCorners(bowTie).ok).toBe(false);
    expect(validateCorners([...SEEN_CORNERS].reverse()).reason).toMatch(/order/);
    const tiny = SQUARE.map((p) => ({ x: 0.5 + p.x * 0.05, y: 0.5 + p.y * 0.05 }));
    expect(validateCorners(tiny).reason).toMatch(/too small/);
  });
});

describe('createMapper', () => {
  const target = getTarget();
  const mapper = createMapper({ corners: SEEN_CORNERS });
  const k = ringShare(target);

  /** Where a target position (in ring-radius units) appears in the picture. */
  const pictureOf = (tx, ty) => seenAt(0.5 + (tx * k) / 2, 0.5 + (ty * k) / 2);

  it('uses the printed sizes: the outer ring is 80 mm on a 180 mm square', () => {
    expect(k).toBeCloseTo(80 / 90, 12);
  });

  it('maps the centre of the rings to (0, 0), scoring 10', () => {
    const centre = pictureOf(0, 0);
    const mapped = mapper.imageToTarget(centre.x, centre.y);
    expect(mapped.x).toBeCloseTo(0, 9);
    expect(mapped.y).toBeCloseTo(0, 9);
    expect(scoreHit(mapped, target)).toBe(10);
  });

  it('scores known points correctly despite the camera angle', () => {
    const cases = [
      { at: [0.05, 0], score: 10 },
      { at: [0, -0.15], score: 9 },
      { at: [-0.45, 0], score: 6 },
      { at: [0.5, 0.5], score: 3 }, // r ~ 0.707
      { at: [0, 0.95], score: 1 },
      { at: [0.8, 0.8], score: 0 }, // outside the rings but still on the sheet
    ];
    for (const { at, score } of cases) {
      const seen = pictureOf(at[0], at[1]);
      const mapped = mapper.imageToTarget(seen.x, seen.y);
      expect(mapped.x).toBeCloseTo(at[0], 9);
      expect(mapped.y).toBeCloseTo(at[1], 9);
      expect(scoreHit(mapped, target)).toBe(score);
    }
  });

  it('maps target positions back into the picture (used to draw the rings)', () => {
    const seen = mapper.targetToImage(0.3, -0.6);
    const expected = pictureOf(0.3, -0.6);
    expect(seen.x).toBeCloseTo(expected.x, 9);
    expect(seen.y).toBeCloseTo(expected.y, 9);
  });

  it('puts the square corners at the expected target distance', () => {
    const mapped = mapper.imageToTarget(SEEN_CORNERS[0].x, SEEN_CORNERS[0].y);
    expect(mapped.x).toBeCloseTo(-90 / 80, 9);
    expect(mapped.y).toBeCloseTo(-90 / 80, 9);
  });

  it('returns null for unusable corners', () => {
    expect(createMapper({ corners: [...SEEN_CORNERS].reverse() })).toBeNull();
  });
});

describe('buildRoiMask', () => {
  it('marks pixels inside the square and leaves the rest', () => {
    const corners = [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.75 }, { x: 0.25, y: 0.75 }];
    const mask = buildRoiMask(corners, 40, 40, 0);
    const at = (x, y) => mask[y * 40 + x];
    expect(at(20, 20)).toBe(1);
    expect(at(2, 2)).toBe(0);
    expect(at(38, 20)).toBe(0);
    expect(mask.reduce((sum, value) => sum + value, 0)).toBe(400); // 20 x 20 pixels
  });

  it('grows by the margin', () => {
    const corners = [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.75 }, { x: 0.25, y: 0.75 }];
    const plain = buildRoiMask(corners, 40, 40, 0).reduce((sum, value) => sum + value, 0);
    const grown = buildRoiMask(corners, 40, 40, 0.2).reduce((sum, value) => sum + value, 0);
    expect(grown).toBeGreaterThan(plain);
  });
});

describe('printableTargetSvg', () => {
  it('is sized in real millimetres with every ring drawn', () => {
    const svg = printableTargetSvg(getTarget());
    expect(svg).toContain('width="183mm"');
    expect(svg).toContain('height="183mm"');
    expect(svg).toContain('viewBox="0 0 183 183"');
    expect(svg.match(/<circle /g)).toHaveLength(10);
    expect(svg).toContain('r="80"');
  });

  it('fits inside the margins browsers use by default, on Letter and on A4', () => {
    // Half an inch a side is the widest default among the common browsers.
    // A sheet that does not fit is shrunk by the browser, and then the square is not 180 mm.
    const { width, height } = sheetSizeMm(getTarget());
    const margin = 12.7;
    for (const paper of [{ w: 215.9, h: 279.4 }, { w: 210, h: 297 }]) {
      expect(width).toBeLessThan(paper.w - margin * 2);
      expect(height).toBeLessThan(paper.h - margin * 2);
    }
  });

  it('draws a 50 mm check bar inside the square, clear of the rings and the corner marks', () => {
    const svg = printableTargetSvg(getTarget());
    const bar = svg.match(/<path d="M([\d.]+) ([\d.]+)h50M/);
    expect(bar).not.toBeNull();
    const [x, y] = [Number(bar[1]), Number(bar[2])];
    // square from 1.5 to 181.5; rings end 80 mm from the centre at 91.5; corner marks are 14 mm long
    expect(y).toBeGreaterThan(91.5 + 80 + 2);
    expect(y).toBeLessThan(181.5 - 2);
    expect(x).toBeGreaterThan(1.5 + 14 + 2);
    expect(x + 50).toBeLessThan(181.5 - 14);
  });
});
