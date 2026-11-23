// Tunable detection settings. Every value is a starting guess chosen against
// synthetic frames; none has been validated against a real camera or cartridge.

export const DEFAULT_DETECTION_PARAMS = Object.freeze({
  // --- per-pixel test ---
  /** Minimum rise in redness (R - max(G, B), 0-255) above the background. */
  redDelta: 60,
  /** Minimum rise in brightness (0-255) for a blown-out pixel to count as a flash core. */
  lumaDelta: 60,
  /** Red channel level at or above which a pixel counts as blown out. */
  saturation: 250,

  // --- per-frame region test ---
  /** Smallest accepted spot, in pixels at the working resolution. */
  minArea: 2,
  /** Largest accepted spot, as a share of the frame. Bigger regions are not a laser dot. */
  maxAreaFraction: 0.01,
  /** If more than this share of the frame changes at once, treat it as a scene change. */
  maxCandidateFraction: 0.03,
  /** How quickly the background follows the scene (0-1 per frame). */
  backgroundRate: 0.05,
  /** Brightness change (0-255) since the previous frame that counts a pixel as "moving". */
  motionDelta: 30,
  /**
   * A flash changes only its own spot. If more than this share of the frame
   * changed since the previous frame, not counting the spot itself, something
   * is moving in view (a hand, a person) and the frame is skipped.
   */
  maxStrayFraction: 0.003,

  // --- grouping frames into one hit ---
  /** A hit ends once no spot has been seen for longer than this. */
  maxGapMs: 40,
  /** Spots farther apart than this (share of frame size) belong to different hits. */
  mergeDistance: 0.06,
  /** Something lit for longer than this is an object in view, not a flash. */
  maxEventMs: 400,
  /** Minimum quiet time between two accepted hits. */
  cooldownMs: 120,
  /** After movement or a lighting change, ignore spots for this long. */
  settleMs: 100,
});

/**
 * Rough 0-1 signal strength for an accepted hit: how far its brightest pixel
 * rose above the threshold. A heuristic for display, not a probability.
 */
export function hitConfidence(event, params = DEFAULT_DETECTION_PARAMS) {
  const margin = (event.peak - params.redDelta) / params.redDelta;
  return Math.max(0, Math.min(1, margin));
}

export function confidenceWord(confidence) {
  if (confidence >= 0.66) return 'strong';
  if (confidence >= 0.33) return 'fair';
  return 'weak';
}
