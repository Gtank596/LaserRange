// ILLUSTRATIVE sampling model: how much of a short flash lands in each frame.
//
// It assumes every frame exposes the whole sensor at once for a fixed time at
// the start of its interval. Real phone cameras differ in ways that matter:
// exposure time is chosen automatically and changes with lighting, rows are
// exposed at slightly different times (rolling shutter), and the browser may
// not deliver every frame. Use this to build test sequences and to reason
// about why exposure matters. Do not quote its output as a capture rate.

/**
 * Share of a frame's exposure window during which the flash was lit (0-1).
 * @param {{ frameIndex: number, frameIntervalMs: number, exposureMs: number, flashStartMs: number, flashDurationMs: number }} options
 */
export function flashExposure({ frameIndex, frameIntervalMs, exposureMs, flashStartMs, flashDurationMs }) {
  const openAt = frameIndex * frameIntervalMs;
  const closeAt = openAt + exposureMs;
  const overlap = Math.min(closeAt, flashStartMs + flashDurationMs) - Math.max(openAt, flashStartMs);
  return overlap > 0 ? Math.min(1, overlap / exposureMs) : 0;
}

/**
 * The strongest single-frame exposure a flash produces under the model.
 * 0 means the flash fell entirely between exposures.
 */
export function peakFlashExposure({ frameIntervalMs, exposureMs, flashStartMs, flashDurationMs }) {
  const first = Math.max(0, Math.floor(flashStartMs / frameIntervalMs) - 1);
  const last = Math.ceil((flashStartMs + flashDurationMs) / frameIntervalMs);
  let peak = 0;
  for (let frameIndex = first; frameIndex <= last; frameIndex++) {
    const value = flashExposure({ frameIndex, frameIntervalMs, exposureMs, flashStartMs, flashDurationMs });
    if (value > peak) peak = value;
  }
  return peak;
}
