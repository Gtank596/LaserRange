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
//   'warming'  first frame, background being initialised
//   'ok'       normal frame
//   'unstable' too much of the frame changed at once (lighting or motion)
//   'adapting' background is catching up after 'unstable' or absorb()

/**
 * @param {number} width
 * @param {number} height
 * @param {Partial<typeof DEFAULT_DETECTION_PARAMS>} [overrides]
 */
export function createFrameDetector(width, height, overrides = {}) {
  const p = { ...DEFAULT_DETECTION_PARAMS, ...overrides };
  const count = width * height;
  const bgRed = new Float32Array(count);
  const bgLuma = new Float32Array(count);
  const score = new Float32Array(count);
  const isRed = new Uint8Array(count);
  const findBlobs = createBlobFinder(width, height);
  const maxArea = Math.max(p.minArea, Math.floor(count * p.maxAreaFraction));
  let initialised = false;
  let fastFrames = 0;

  const empty = (status, candidateFraction = 0) => ({ status, candidateFraction, blobs: [], best: null });

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
      if (data.length !== count * 4) throw new Error(`Expected ${count * 4} bytes, got ${data.length}`);

      if (!initialised) {
        for (let i = 0, j = 0; i < count; i++, j += 4) {
          const r = data[j];
          const g = data[j + 1];
          const b = data[j + 2];
          const mx = g > b ? g : b;
          bgRed[i] = r > mx ? r - mx : 0;
          bgLuma[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
        initialised = true;
        return empty('warming');
      }

      const fast = fastFrames > 0;
      let candidates = 0;
      for (let i = 0, j = 0; i < count; i++, j += 4) {
        const r = data[j];
        const g = data[j + 1];
        const b = data[j + 2];
        const mx = g > b ? g : b;
        const red = r > mx ? r - mx : 0;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const dRed = red - bgRed[i];
        const dLuma = luma - bgLuma[i];

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
      if (fast) {
        fastFrames -= 1;
        return empty('adapting', candidateFraction);
      }
      if (candidateFraction > p.maxCandidateFraction) {
        fastFrames = 4;
        return empty('unstable', candidateFraction);
      }
      if (candidates === 0) return empty('ok');

      const blobs = findBlobs(score, isRed).filter(
        (blob) => blob.area >= p.minArea && blob.area <= maxArea && blob.redArea >= 1,
      );
      let best = null;
      for (const blob of blobs) {
        if (!best || blob.strength > best.strength) best = blob;
      }
      return { status: 'ok', candidateFraction, blobs, best };
    },
  };
}
