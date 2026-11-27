// The session clock: time spent watching, with pauses left out. Hit times and
// the session's length are both read from it, so a hit's time always falls
// inside the session's length however long the pauses were.
//
// Every method takes the current time (any steady millisecond clock, the same
// one each call), so this file needs no browser and can be tested.

export function createSessionClock() {
  /** @type {number | null} */
  let startedAt = null;
  /** @type {number | null} */
  let pausedAt = null;
  let pausedTotal = 0;

  return {
    get started() {
      return startedAt !== null;
    },
    get paused() {
      return pausedAt !== null;
    },
    /** Starts the clock. Later calls change nothing. */
    start(now) {
      if (startedAt === null) startedAt = now;
    },
    /** Stops the clock. Does nothing before start or when already paused. */
    pause(now) {
      if (startedAt !== null && pausedAt === null) pausedAt = Math.max(now, startedAt);
    },
    resume(now) {
      if (pausedAt === null) return;
      pausedTotal += Math.max(0, now - pausedAt);
      pausedAt = null;
    },
    /**
     * Watching time up to `now`, in ms. While paused it stands still, and a
     * time from just before the pause still reads correctly.
     */
    elapsed(now) {
      if (startedAt === null) return 0;
      const end = pausedAt !== null ? Math.min(now, pausedAt) : now;
      return Math.max(0, end - startedAt - pausedTotal);
    },
    /** Total time spent paused up to `now`, in ms. */
    pausedMs(now) {
      return pausedTotal + (pausedAt !== null ? Math.max(0, now - pausedAt) : 0);
    },
  };
}
