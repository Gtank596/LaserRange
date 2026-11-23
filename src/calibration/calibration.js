import { applyHomography, computeHomography, invertHomography, isConvexQuad, pointInQuad, signedArea } from './homography.js';
import { DEFAULT_TARGET_ID, getTarget, ringShare } from './targets.js';

// A calibration is the four corners of the printed square as seen in the
// video, in order: top-left, top-right, bottom-right, bottom-left. Corner
// positions are stored as 0-1 fractions of the video frame.
//
// Coordinate systems:
//   image   0-1 across and down the video frame
//   target  (0, 0) at the centre of the rings, 1 = outer ring radius
//           (the same system calibration/scoring.js scores in)

/** @typedef {import('./homography.js').Point} Point */

const UNIT_SQUARE = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/** Smallest usable share of the frame for the calibrated square. */
const MIN_AREA = 0.02;

/**
 * @param {Point[]} corners
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateCorners(corners) {
  if (!Array.isArray(corners) || corners.length !== 4) return { ok: false, reason: 'Four corners are needed.' };
  if (!isConvexQuad(corners)) return { ok: false, reason: 'The corners are crossed or in a line. Keep them in order around the square.' };
  if (signedArea(corners) <= 0) return { ok: false, reason: 'The corners are in the wrong order. Number 1 goes top-left, then clockwise.' };
  if (signedArea(corners) < MIN_AREA) return { ok: false, reason: 'The square is too small in the picture. Move the camera closer.' };
  return { ok: true };
}

/**
 * Builds the two-way mapping between the picture and the target.
 * @param {{ corners: Point[], targetId?: string }} calibration
 * @returns {null | { target: import('./targets.js').TargetDefinition, imageToTarget: (x: number, y: number) => Point, targetToImage: (x: number, y: number) => Point }}
 *   null when the corners cannot define a mapping
 */
export function createMapper({ corners, targetId = DEFAULT_TARGET_ID }) {
  if (!validateCorners(corners).ok) return null;
  const toSquare = computeHomography(corners, UNIT_SQUARE);
  const toImage = toSquare && invertHomography(toSquare);
  if (!toSquare || !toImage) return null;
  const target = getTarget(targetId);
  const k = ringShare(target);

  return {
    target,
    imageToTarget(x, y) {
      const p = applyHomography(toSquare, x, y);
      return { x: ((p.x - 0.5) * 2) / k, y: ((p.y - 0.5) * 2) / k };
    },
    targetToImage(x, y) {
      return applyHomography(toImage, 0.5 + (x * k) / 2, 0.5 + (y * k) / 2);
    },
  };
}

/**
 * A per-pixel mask (1 = inside) of the calibrated square at a working
 * resolution, grown slightly so a dot on the border is not cut off.
 * @param {Point[]} corners
 * @param {number} width
 * @param {number} height
 * @param {number} [margin] growth as a share of each corner's distance from the centre
 */
export function buildRoiMask(corners, width, height, margin = 0.04) {
  const cx = corners.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = corners.reduce((sum, p) => sum + p.y, 0) / 4;
  const grown = corners.map((p) => ({ x: cx + (p.x - cx) * (1 + margin), y: cy + (p.y - cy) * (1 + margin) }));
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pointInQuad(grown, (x + 0.5) / width, (y + 0.5) / height)) mask[y * width + x] = 1;
    }
  }
  return mask;
}
