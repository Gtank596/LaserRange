import { createBlobFinder } from './blobs.js';
import { DEFAULT_DETECTION_PARAMS } from './params.js';

// Finds the spot, if any, where one frame suddenly became red compared with
// the recent past.
//
// For every pixel we keep a slowly updating background of its redness and
// brightness. A pixel is a candidate when its redness jumps above that
// background, or when it is blown out and much brighter than before (the white
// core a bright red dot can produce). Candidates are grouped into regions;
// a region must be small and must contain at least one red-dominant pixel.
//
// Status values:
//   'warming'  first frame, background being initialised (the pipeline also
//              reports 'warming' for its whole start-of-run warm-up)
//   'ok'       normal frame
//   'unstable' too much of the frame changed at once (lighting or motion)
//   'adapting' background is catching up after 'unstable' or absorb()
//   'motion'   a spot was found while other parts of the frame changed too:
//              something is moving in view. Nothing in the frame is trusted.
//              (First seen on a real camera: a waving hand produced weak red
//              "spots" at its edge.)
//   'large'    a lit region too big to be a laser dot. Nothing in the frame is
//              trusted. (First seen on a real camera: a bare LED lit about 2%
//              of the picture by shining on the white board it stood on.)
//
// What counts as "other parts of the frame": a flash also brightens a glow
// around itself when it comes on, and that glow fades when it goes off. So
// near the spot, change in one direction only is part of the flash. A moving
// object brightens where it arrives and darkens where it left, so change in
// both directions near the spot, or any change away from it, is movement.

/**
 * @param {number} width
 * @param {number} height
 * @param {Partial<typeof DEFAULT_DETECTION_PARAMS>} [overrides]
 * @param {{ mask?: Uint8Array | null }} [options] mask: 1 for pixels to watch (the calibrated
 *   target area), 0 to ignore. Everything outside is invisible to detection, including movement.
 *   The size limits stay shares of the whole picture.
 */
export function createFrameDetector(width, height, overrides = {}, { mask = null } = {}) {
  const p = { ...DEFAULT_DETECTION_PARAMS, ...overrides };
  const pixels = width * height;
  if (mask && mask.length !== pixels) throw new Error(`Mask must have ${pixels} entries, got ${mask.length}`);
  // Every "share of the frame" limit is measured against the whole picture,
  // with or without a mask, so a flash is judged the same way in both cases.
  // (Until 2026-11-28 a mask made the limits a share of the watched area. A
  // target is a small part of the picture, so a flash that was well inside
  // the limits without a target went far over them with one: on the phone
  // every LED flash on a found target was reported as a scene change.)
  const count = pixels;
  const bgRed = new Float32Array(pixels);
  const bgLuma = new Float32Array(pixels);
  const prevLuma = new Float32Array(pixels);
  const score = new Float32Array(pixels);
  const isRed = new Uint8Array(pixels);
  const moved = new Uint8Array(pixels); // since the previous frame: 1 brighter, 2 darker
  const findBlobs = createBlobFinder(width, height);
  const maxArea = Math.max(p.minArea, Math.floor(count * p.maxAreaFraction));
  let initialised = false;
  let fastFrames = 0;

  const empty = (status, candidateFraction = 0, motionFraction = 0, largest = null) => ({
    status,
    candidateFraction,
    motionFraction,
    largest,
    blobs: [],
    best: null,
  });

  /** The biggest lit region of a frame, with its size as a share of the picture. */
  const describeLargest = (regions) => {
    let big = null;
    for (const blob of regions) if (!big || blob.area > big.area) big = blob;
    return big ? { x: big.x, y: big.y, fraction: big.area / count } : null;
  };

  /** Pixels that changed since the previous frame and are not explained by this spot's own glow. */
  function strayPixels(blob, moving) {
    const size = Math.max(blob.maxX - blob.minX, blob.maxY - blob.minY) + 1;
    const margin = Math.max(Math.round(width * p.haloMin), Math.round(size * p.haloScale));
    const x0 = Math.max(0, blob.minX - margin);
    const x1 = Math.min(width - 1, blob.maxX + margin);
    const y0 = Math.max(0, blob.minY - margin);
    const y1 = Math.min(height - 1, blob.maxY + margin);
    let brighter = 0;
    let darker = 0;
    for (let y = y0; y <= y1; y++) {
      for (let i = y * width + x0, end = y * width + x1; i <= end; i++) {
        if (moved[i] === 1) brighter += 1;
        else if (moved[i] === 2) darker += 1;
      }
    }
    return moving - (brighter + darker) + Math.min(brighter, darker);
  }

  return {
    width,
    height,
    params: p,

    /** Make the background swallow whatever is in view over the next few frames. */
    absorb(frames = 6) {
      fastFrames = Math.max(fastFrames, frames);
    },

    /** @param {Uint8ClampedArray | Uint8Array} data RGBA pixels, width * height * 4 */
    process(data) {
      if (data.length !== pixels * 4) throw new Error(`Expected ${pixels * 4} bytes, got ${data.length}`);

      if (!initialised) {
        for (let i = 0, j = 0; i < pixels; i++, j += 4) {
          const r = data[j];
          const g = data[j + 1];
          const b = data[j + 2];
          const mx = g > b ? g : b;
          bgRed[i] = r > mx ? r - mx : 0;
          bgLuma[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          prevLuma[i] = bgLuma[i];
        }
        initialised = true;
        return empty('warming');
      }

      const fast = fastFrames > 0;
      let candidates = 0;
      let moving = 0;
      for (let i = 0, j = 0; i < pixels; i++, j += 4) {
        if (mask !== null && mask[i] === 0) {
          score[i] = 0;
          continue;
        }
        const r = data[j];
        const g = data[j + 1];
        const b = data[j + 2];
        const mx = g > b ? g : b;
        const red = r > mx ? r - mx : 0;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const dRed = red - bgRed[i];
        const dLuma = luma - bgLuma[i];

        // Change since the previous frame (not the background): this is what
        // tells a moving object, which changes where it was as well as where
        // it is, from a flash, which changes one spot.
        const dPrev = luma - prevLuma[i];
        prevLuma[i] = luma;
        if (dPrev >= p.motionDelta) {
          moved[i] = 1;
          moving += 1;
        } else if (dPrev <= -p.motionDelta) {
          moved[i] = 2;
          moving += 1;
        } else {
          moved[i] = 0;
        }

        let s = 0;
        let redFlag = 0;
        if (dRed >= p.redDelta) {
          s = dRed;
          redFlag = 1;
        } else if (r >= p.saturation && dLuma >= p.lumaDelta) {
          s = dLuma;
        }
        score[i] = s;
        isRed[i] = redFlag;
        if (s > 0) candidates += 1;

        // Candidate pixels barely move the background, so a flash does not
        // erase itself; everything else tracks the scene.
        const rate = fast ? 0.5 : s > 0 ? p.backgroundRate * 0.1 : p.backgroundRate;
        bgRed[i] += rate * dRed;
        bgLuma[i] += rate * dLuma;
      }

      const candidateFraction = candidates / count;
      const motionFraction = moving / count;
      if (fast) {
        fastFrames -= 1;
        return empty('adapting', candidateFraction, motionFraction);
      }
      if (candidateFraction > p.maxCandidateFraction) {
        fastFrames = 4;
        return empty('unstable', candidateFraction, motionFraction);
      }
      if (candidates === 0) return empty('ok', 0, motionFraction);

      const regions = findBlobs(score, isRed);
      const largest = describeLargest(regions);
      // A lit region bigger than any laser dot is not a hit; nothing else in
      // this frame is trusted either.
      if (regions.some((blob) => blob.area > maxArea)) return empty('large', candidateFraction, motionFraction, largest);

      const blobs = regions.filter((blob) => blob.area >= p.minArea && blob.redArea >= 1);
      let best = null;
      for (const blob of blobs) {
        if (!best || blob.strength > best.strength) best = blob;
      }
      if (best) {
        // Movement not explained by the spot itself, as a share of the frame.
        best.stray = strayPixels(best, moving) / count;
        if (best.stray > p.maxStrayFraction) return empty('motion', candidateFraction, motionFraction, largest);
      }
      return { status: 'ok', candidateFraction, motionFraction, largest, blobs, best };
    },
  };
}
