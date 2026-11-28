// Keeps count of the times a session saw something and did not count it, and
// why. A saved session otherwise lists hits only, so a flash that was refused
// leaves no trace and there is no telling afterwards whether it was too big,
// came with movement, or was never seen at all.
//
// Two kinds of thing are counted:
//   - spells of a "not counting" state: the detector reported it for one or
//     more frames in a row (too big, movement, the picture changed). One spell
//     counts once however many frames it lasts.
//   - flashes the grouping step refused on its own: lit for too long to be a
//     flash, or too soon after the previous hit.
//
// These are not misses. A spell of movement may be a hand, not a flash. And a
// flash the camera never caught appears nowhere.

/** The reasons, in the order they are shown. */
export const SKIP_REASONS = Object.freeze(['large', 'motion', 'unstable', 'persistent', 'cooldown']);

const WORDS = {
  large: 'too big to be a hit',
  motion: 'movement in view',
  unstable: 'the picture changed',
  persistent: 'stayed lit too long',
  cooldown: 'too soon after a hit',
};

const STATE_REASONS = new Set(['large', 'motion', 'unstable']);
const EVENT_REASONS = new Set(['persistent', 'cooldown']);

export function createSkipCounter() {
  const counts = Object.fromEntries(SKIP_REASONS.map((reason) => [reason, 0]));
  let previous = null;

  return {
    /**
     * Call once per analysed frame.
     * @param {string} status the frame's status from the pipeline
     * @param {{ accepted: boolean, reason?: string } | null} [event] the event the frame closed, if any
     */
    note(status, event = null) {
      if (STATE_REASONS.has(status) && status !== previous) counts[status] += 1;
      // 'adapting' is the detector catching up after a change: part of the same spell.
      if (status !== 'adapting') previous = status;
      if (event && !event.accepted && EVENT_REASONS.has(event.reason)) counts[event.reason] += 1;
    },
    /** Starts a fresh run of frames (after a pause): the next state counts as a new spell. */
    breakRun() {
      previous = null;
    },
    counts() {
      return { ...counts };
    },
  };
}

/** Total across all reasons; 0 for a missing or damaged record. */
export function totalSkips(counts) {
  if (!counts || typeof counts !== 'object') return 0;
  return SKIP_REASONS.reduce((sum, reason) => sum + (Number.isFinite(counts[reason]) ? counts[reason] : 0), 0);
}

/**
 * "2 too big to be a hit · 1 movement in view", or "nothing" when all are zero.
 * @param {Record<string, number> | undefined} counts
 */
export function describeSkips(counts) {
  if (totalSkips(counts) === 0) return 'nothing';
  return SKIP_REASONS.filter((reason) => counts[reason] > 0)
    .map((reason) => `${counts[reason]} ${WORDS[reason]}`)
    .join(' · ');
}
