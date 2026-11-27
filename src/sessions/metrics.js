import { summarizeHits } from '../calibration/scoring.js';
import { safePrintScale } from '../calibration/printScale.js';
import { getTarget } from '../calibration/targets.js';

// What a saved session looks like, and the numbers worked out from its hits.
//
// A session is "scored" only when a target calibration was in use: then every
// hit has a position on the target (targetX/targetY, where 1 is the outer ring
// radius) and a ring score. Without a calibration hits are counted and their
// place in the picture is kept, but nothing about rings or millimetres is
// claimed.

/**
 * @typedef {object} SessionHit
 * @property {number} tMs        watching time since the session started (pauses left out)
 * @property {number} x          position in the picture, 0-1 across
 * @property {number} y          position in the picture, 0-1 down
 * @property {number} [targetX]  position on the target (scored sessions only)
 * @property {number} [targetY]
 * @property {number} [score]    ring score, 0 when outside the rings (scored sessions only)
 * @property {number} confidence 0-1 signal strength (a rough level, not a probability)
 * @property {number} frames     video frames the flash was seen in
 */

/**
 * @typedef {object} SessionRecord
 * @property {string} id
 * @property {1} schema
 * @property {string} startedAt   ISO time
 * @property {string} endedAt     ISO time
 * @property {number} durationMs  time spent watching: pauses are left out
 * @property {number} [pausedMs]  total time paused (absent in sessions saved before pause existed)
 * @property {'environment' | 'synthetic'} source
 * @property {boolean} simulated  true for the test pattern: not a real camera session
 * @property {boolean} scored     a calibration was in use
 * @property {string | null} targetId
 * @property {number} [printScale]  how big the sheet printed: 0.95 when its 50 mm bar measured 47.5 mm. Absent means 1
 * @property {{ redDelta: number, dotLimit: string }} settings
 * @property {string} build
 * @property {SessionHit[]} hits
 */

/**
 * The widest distance between any two hits, in millimetres on the paper
 * ("extreme spread"). Null with fewer than two hits.
 * @param {{ targetX: number, targetY: number }[]} hits
 * @param {{ outerRingRadiusMm: number }} target
 * @param {number} [printScale] how big the sheet actually printed (1 = full size)
 */
export function groupSizeMm(hits, target, printScale = 1) {
  if (hits.length < 2) return null;
  let widest = 0;
  for (let i = 0; i < hits.length; i++) {
    for (let j = i + 1; j < hits.length; j++) {
      const d = Math.hypot(hits[i].targetX - hits[j].targetX, hits[i].targetY - hits[j].targetY);
      if (d > widest) widest = d;
    }
  }
  return widest * target.outerRingRadiusMm * printScale;
}

/**
 * Totals for a session. Score, accuracy and group size are null when the
 * session was not scored.
 * "Accuracy" is points scored out of points possible for the hits that were
 * detected; it cannot account for anything the camera did not see.
 * @param {Pick<SessionRecord, 'hits' | 'scored' | 'targetId' | 'printScale'>} session
 */
export function summarizeSession({ hits, scored, targetId, printScale }) {
  if (!scored) {
    return { hits: hits.length, scored: false, score: null, maxScore: null, accuracyPct: null, groupMm: null, onTarget: null };
  }
  const target = getTarget(targetId ?? undefined);
  const points = hits.map((hit) => ({ x: hit.targetX, y: hit.targetY }));
  const totals = summarizeHits(points, target);
  return {
    hits: hits.length,
    scored: true,
    score: totals.score,
    maxScore: totals.maxScore,
    accuracyPct: totals.accuracyPct,
    groupMm: groupSizeMm(hits, target, safePrintScale(printScale)),
    /** Hits that landed inside the rings. */
    onTarget: hits.filter((hit) => hit.score > 0).length,
  };
}

/** A new id for a session: unique on this device, and sorts roughly by time. */
export function newSessionId(now = Date.now(), random = Math.random) {
  return `${now.toString(36)}-${Math.floor(random() * 0xffffff).toString(36).padStart(4, '0')}`;
}

/**
 * Checks that a value read from storage is a usable session, so one damaged
 * record cannot break the history screen.
 * @returns {value is SessionRecord}
 */
export function isSessionRecord(value) {
  return Boolean(
    value &&
      typeof value.id === 'string' &&
      typeof value.startedAt === 'string' &&
      !Number.isNaN(Date.parse(value.startedAt)) &&
      Array.isArray(value.hits) &&
      value.hits.every((hit) => hit && Number.isFinite(hit.x) && Number.isFinite(hit.y)),
  );
}
