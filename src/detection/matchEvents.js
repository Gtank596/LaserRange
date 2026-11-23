// Scores detections against ground truth: which emitted flashes were found,
// which were missed, and which detections correspond to nothing.

/**
 * One-to-one matching: each flash, in time order, takes the closest unused
 * detection (by position) that falls inside its time window. Position does
 * most of the work, so the time window can be generous; that matters when
 * frames are delivered slowly or in bursts.
 * @param {{ t: number, x: number, y: number }[]} emitted  ground-truth flashes
 * @param {{ t: number, x: number, y: number }[]} detected accepted hits
 * @param {{ now?: number, maxDelayMs?: number, maxEarlyMs?: number, maxDistance?: number }} [options]
 *   now: emitted flashes newer than now - maxDelayMs are "pending", not yet missed.
 */
export function matchEvents(emitted, detected, { now = Infinity, maxDelayMs = 800, maxEarlyMs = 50, maxDistance = 0.08 } = {}) {
  const used = new Array(detected.length).fill(false);
  let matched = 0;
  let missed = 0;
  let pending = 0;
  let errorSum = 0;
  let maxError = 0;

  for (const flash of emitted) {
    let found = -1;
    let foundError = 0;
    for (let i = 0; i < detected.length; i++) {
      if (used[i]) continue;
      const hit = detected[i];
      const delay = hit.t - flash.t;
      if (delay < -maxEarlyMs || delay > maxDelayMs) continue;
      const error = Math.hypot(hit.x - flash.x, hit.y - flash.y);
      if (error > maxDistance) continue;
      if (found < 0 || error < foundError) {
        found = i;
        foundError = error;
      }
    }
    if (found >= 0) {
      used[found] = true;
      matched += 1;
      errorSum += foundError;
      if (foundError > maxError) maxError = foundError;
    } else if (now - flash.t <= maxDelayMs) {
      pending += 1;
    } else {
      missed += 1;
    }
  }

  return {
    emitted: emitted.length,
    detected: detected.length,
    matched,
    missed,
    pending,
    extra: used.filter((flag) => !flag).length,
    meanError: matched ? errorSum / matched : null,
    maxError: matched ? maxError : null,
  };
}
