import { DEFAULT_DETECTION_PARAMS } from './params.js';

// Turns per-frame spots into hits: one flash seen in several consecutive
// frames must be reported once.
//
// push(t, blob) is called for every frame, with the frame's best spot or null.
// It returns null, or one event:
//   { accepted: true,  index, t, endT, durationMs, frames, x, y, peak, area }
//   { accepted: false, reason: 'cooldown' | 'persistent', ...same fields }

/**
 * @param {Partial<typeof DEFAULT_DETECTION_PARAMS>} [overrides]
 */
export function createEventGrouper(overrides = {}) {
  const p = { ...DEFAULT_DETECTION_PARAMS, ...overrides };
  let active = null;
  let lastAcceptedEnd = -Infinity;
  let accepted = 0;

  const summary = (ev) => ({
    t: ev.startT,
    endT: ev.lastT,
    durationMs: ev.lastT - ev.startT,
    frames: ev.frames,
    x: ev.wx / ev.w,
    y: ev.wy / ev.w,
    peak: ev.peak,
    area: ev.area,
  });

  function finish() {
    const ev = active;
    active = null;
    if (ev.persistent) return null; // already reported when it ran too long
    const result = summary(ev);
    if (result.t - lastAcceptedEnd < p.cooldownMs) return { ...result, accepted: false, reason: 'cooldown' };
    lastAcceptedEnd = result.endT;
    accepted += 1;
    return { ...result, accepted: true, index: accepted };
  }

  return {
    /**
     * @param {number} t frame time in ms
     * @param {import('./blobs.js').Blob | null} blob
     */
    push(t, blob) {
      let out = null;

      // A spot somewhere else closes the current hit and starts a new one.
      if (active && blob && !active.persistent) {
        const far = Math.hypot(blob.x - active.wx / active.w, blob.y - active.wy / active.w) > p.mergeDistance;
        if (far) out = finish();
      }

      if (blob) {
        if (!active) active = { startT: t, lastT: t, frames: 0, w: 0, wx: 0, wy: 0, peak: 0, area: 0, persistent: false };
        active.lastT = t;
        active.frames += 1;
        active.w += blob.strength;
        active.wx += blob.x * blob.strength;
        active.wy += blob.y * blob.strength;
        if (blob.peak > active.peak) active.peak = blob.peak;
        if (blob.area > active.area) active.area = blob.area;

        if (!active.persistent && t - active.startT > p.maxEventMs) {
          active.persistent = true;
          out = out ?? { ...summary(active), accepted: false, reason: 'persistent' };
        }
      } else if (active && t - active.lastT > p.maxGapMs) {
        out = finish() ?? out;
      }
      return out;
    },

    /** Closes any hit still in progress (for the end of a recording). */
    flush() {
      return active ? finish() : null;
    },
  };
}
