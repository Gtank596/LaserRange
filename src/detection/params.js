// Tunable detection settings. Every value is a starting guess chosen against
// synthetic frames. The first runs against a real LED (2026-11-25) changed how
// movement is told from a flash's own glow. One run with a laser cartridge
// (2026-11-28, set off by finger, not in a firearm) showed flashes lit for far
// longer than the LED's, probably for as long as the finger pressed, which changed
// maxEventMs and where a hit is placed. No value has been validated against a
// known number of cartridge flashes.

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
   * A flash changes only its own spot and the glow around it. If more than
   * this share of the frame changed since the previous frame in a way the spot
   * does not explain, something is moving in view (a hand, a person) and the
   * frame is skipped.
   */
  maxStrayFraction: 0.003,
  /**
   * How far a spot's own glow is allowed to reach: this many times the spot's
   * size on every side, and at least haloMin of the frame width.
   */
  haloScale: 1,
  haloMin: 0.02,

  // --- start of a run ---
  /**
   * Nothing is counted for this long after the first frame, and the background
   * follows the picture closely meanwhile. A camera that has just started is
   * still settling: in two LED runs (2026-11-25 and 2026-11-27) a red spot at
   * the unlit LED was seen in the first 0.3 to 1.85 s, before any flash.
   */
  warmupMs: 2000,

  // --- grouping frames into one hit ---
  /** A hit ends once no spot has been seen for longer than this. */
  maxGapMs: 40,
  /** Spots farther apart than this (share of frame size) belong to different hits. */
  mergeDistance: 0.06,
  /**
   * Something lit for longer than this is an object in view, not a flash.
   * Was 400 until the first cartridge run: the hits that run counted were lit
   * for 50 to 385 ms, four of them within a frame or two of 400, so longer
   * flashes may have been refused unseen. 1000 is a guess with room to spare,
   * not a measured upper limit. Those flashes were finger presses: how long
   * the flash lasts in real use is unknown.
   */
  maxEventMs: 1000,
  /** A lit area too big to be a dot is taken into the background after this long. */
  absorbLargeMs: 400,
  /**
   * A hit is placed where the spot was during this long after it first
   * appeared, not averaged over the whole time it was lit: a dot that is lit
   * for a fifth of a second can move while it is on, and the start is the shot.
   */
  aimWindowMs: 50,
  /** Minimum quiet time between two accepted hits. */
  cooldownMs: 120,
  /** After movement or a lighting change, ignore spots for this long. */
  settleMs: 100,
});

/**
 * How big a lit area may be and still count as a dot. "large" is for testing
 * with a bare LED, which lights up its surroundings as well as itself.
 */
export const DOT_LIMITS = Object.freeze({
  normal: Object.freeze({ maxAreaFraction: 0.01, maxCandidateFraction: 0.03 }),
  large: Object.freeze({ maxAreaFraction: 0.05, maxCandidateFraction: 0.1 }),
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
