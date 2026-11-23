// Frame-timing statistics. Pure (no DOM), so it is unit tested directly.
//
// Two interval series are kept because they answer different questions:
//  - callback intervals: when OUR code actually received each frame. Includes
//    main-thread scheduling jitter; this is what detection will live with.
//  - media intervals: spacing on the video's own timeline, when the browser
//    reports a usable mediaTime. Closer to the camera's delivery cadence.

const isNum = (value) => typeof value === 'number' && Number.isFinite(value);

/** Nearest-rank percentile of an ascending-sorted array. */
export function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/** @param {number[]} values */
export function summarize(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    mean: sum / sorted.length,
    min: sorted[0],
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1],
  };
}

/**
 * Rolling frame statistics over the most recent `windowSize` frames, plus
 * running totals since creation.
 * @param {{ windowSize?: number, longIntervalFactor?: number }} [options]
 */
export function createFrameStats({ windowSize = 240, longIntervalFactor = 1.5 } = {}) {
  const callbackIntervals = [];
  const mediaIntervals = [];
  const processTimes = [];
  let frames = 0;
  let missedFrames = 0;
  let sawPresentedFrames = false;
  let last = null;

  const pushCapped = (list, value) => {
    list.push(value);
    if (list.length > windowSize) list.shift();
  };

  return {
    /** @param {{ now: number, mediaTime?: number, presentedFrames?: number, processMs?: number }} frame */
    push(frame) {
      if (last) {
        pushCapped(callbackIntervals, frame.now - last.now);
        if (isNum(frame.mediaTime) && isNum(last.mediaTime) && frame.mediaTime > last.mediaTime) {
          pushCapped(mediaIntervals, (frame.mediaTime - last.mediaTime) * 1000);
        }
        if (isNum(frame.presentedFrames) && isNum(last.presentedFrames)) {
          sawPresentedFrames = true;
          // A jump of more than 1 means the browser presented frames that our
          // callback never got to see.
          const skipped = frame.presentedFrames - last.presentedFrames - 1;
          if (skipped > 0) missedFrames += skipped;
        }
      }
      if (isNum(frame.processMs)) pushCapped(processTimes, frame.processMs);
      frames += 1;
      last = frame;
    },

    snapshot() {
      const callback = summarize(callbackIntervals);
      const longIntervals = callback
        ? callbackIntervals.filter((interval) => interval > callback.median * longIntervalFactor).length
        : 0;
      return {
        frames,
        /** null when the browser does not report presentedFrames */
        missedFrames: sawPresentedFrames ? missedFrames : null,
        /** intervals in the window longer than longIntervalFactor x the median */
        longIntervals,
        observedFps: callback && callback.mean > 0 ? 1000 / callback.mean : null,
        callbackIntervalMs: callback,
        mediaIntervalMs: summarize(mediaIntervals),
        processMs: summarize(processTimes),
        recentIntervalsMs: [...callbackIntervals],
      };
    },
  };
}
