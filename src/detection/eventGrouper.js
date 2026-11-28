import { DEFAULT_DETECTION_PARAMS } from './params.js';

// Turns per-frame spots into hits: one flash seen in several consecutive
// frames must be reported once.
//
// push(t, blob) is called for every frame, with the frame's best spot or null.
// It returns null, or one event:
//   { accepted: true,  index, t, endT, durationMs, frames, x, y, travel, peak, area, stray }
//   { accepted: false, reason: 'cooldown' | 'persistent', ...same fields }
// cancel(reason) discards the hit in progress (used when the scene is disturbed;
// the pipeline passes 'motion' or 'large').
//
// x, y is where the spot was when it first appeared (its first aimWindowMs),
// and travel is how far it had moved from there by its last frame, as a share
// of the picture. durationMs runs from the first frame it was seen in to the
// last, so the light was on for about one frame longer than that.

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
    x: ev.ax / ev.aw,
    y: ev.ay / ev.aw,
    travel: Math.hypot(ev.lastX - ev.ax / ev.aw, ev.lastY - ev.ay / ev.aw),
    peak: ev.peak,
    area: ev.area,
    stray: ev.stray,
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

      // A spot that has jumped somewhere else closes the current hit and
      // starts a new one. The jump is measured from the previous frame, so a
      // dot that drifts while it is lit stays one hit however far it goes.
      if (active && blob && !active.persistent) {
        const far = Math.hypot(blob.x - active.lastX, blob.y - active.lastY) > p.mergeDistance;
        if (far) out = finish();
      }

      if (blob) {
        if (!active) active = { startT: t, lastT: t, frames: 0, aw: 0, ax: 0, ay: 0, lastX: blob.x, lastY: blob.y, peak: 0, area: 0, stray: 0, persistent: false };
        if ((blob.stray ?? 0) > active.stray) active.stray = blob.stray;
        active.lastT = t;
        active.frames += 1;
        active.lastX = blob.x;
        active.lastY = blob.y;
        if (t - active.startT < p.aimWindowMs) {
          active.aw += blob.strength;
          active.ax += blob.x * blob.strength;
          active.ay += blob.y * blob.strength;
        }
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

    /**
     * Throws away the hit in progress, if any, because the frames around it
     * cannot be trusted. Returns the rejection, or null if nothing was active.
     */
    cancel(reason) {
      if (!active) return null;
      const ev = active;
      active = null;
      return ev.persistent ? null : { ...summary(ev), accepted: false, reason };
    },

    /** Closes any hit still in progress (for the end of a recording). */
    flush() {
      return active ? finish() : null;
    },
  };
}
