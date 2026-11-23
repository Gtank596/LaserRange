// Ring scoring in normalised target coordinates.
//
// Coordinates: (0, 0) is the target centre and a distance of 1 is the outer
// edge of the lowest-scoring ring, so scoring is independent of camera
// resolution and print size. +x is right, +y is down (screen convention).

/** @typedef {{ id: string, name: string, ringCount: number }} TargetGeometry */

/** Evenly spaced rings scoring ringCount (centre) down to 1 (outer ring). */
export const TEN_RING_TARGET = Object.freeze({
  id: 'ten-ring',
  name: '10-ring practice target',
  ringCount: 10,
});

// Guards against floating-point noise when a point sits exactly on a ring line
// (0.3 * 10 evaluates to 3.0000000000000004).
const EPSILON = 1e-9;

/**
 * Score for one hit. A hit exactly on a ring line gets the higher ring; a hit
 * outside the outer ring, or with invalid coordinates, scores 0.
 * @param {{ x: number, y: number }} hit
 * @param {TargetGeometry} [target]
 */
export function scoreHit(hit, target = TEN_RING_TARGET) {
  const r = Math.hypot(hit.x, hit.y);
  if (!Number.isFinite(r) || r > 1 + EPSILON) return 0;
  const ringsOut = Math.max(1, Math.ceil(r * target.ringCount - EPSILON));
  return target.ringCount - ringsOut + 1;
}

/**
 * Totals for a list of hits.
 * "Accuracy" here means points scored / points possible for the hits that were
 * detected. It cannot account for shots the camera never saw.
 * @param {{ x: number, y: number }[]} hits
 * @param {TargetGeometry} [target]
 */
export function summarizeHits(hits, target = TEN_RING_TARGET) {
  const score = hits.reduce((sum, hit) => sum + scoreHit(hit, target), 0);
  const maxScore = hits.length * target.ringCount;
  return {
    hits: hits.length,
    score,
    maxScore,
    accuracyPct: maxScore === 0 ? null : Math.round((score / maxScore) * 100),
  };
}
