// Connected-region labelling over a per-pixel score map (0 = not a candidate).

/**
 * @typedef {object} Blob
 * @property {number} area      candidate pixels in the region
 * @property {number} redArea   how many of them are red-dominant (not just bright)
 * @property {number} strength  sum of pixel scores
 * @property {number} peak      highest pixel score
 * @property {number} x         score-weighted centre, 0-1 across the frame width
 * @property {number} y         score-weighted centre, 0-1 down the frame height
 */

/**
 * Returns a finder that reuses its scratch buffers between frames.
 * Pixels touching at edges or corners belong to the same region.
 */
export function createBlobFinder(width, height) {
  const count = width * height;
  const seen = new Uint8Array(count);
  const stack = new Int32Array(count);

  /**
   * @param {Float32Array} score
   * @param {Uint8Array} isRed
   * @returns {Blob[]}
   */
  return function findBlobs(score, isRed) {
    seen.fill(0);
    const blobs = [];
    for (let start = 0; start < count; start++) {
      if (score[start] <= 0 || seen[start]) continue;

      let top = 0;
      stack[top++] = start;
      seen[start] = 1;
      let area = 0;
      let redArea = 0;
      let strength = 0;
      let peak = 0;
      let sumX = 0;
      let sumY = 0;

      while (top > 0) {
        const i = stack[--top];
        const x = i % width;
        const y = (i - x) / width;
        const s = score[i];
        area += 1;
        redArea += isRed[i];
        strength += s;
        if (s > peak) peak = s;
        sumX += s * (x + 0.5);
        sumY += s * (y + 0.5);

        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const j = ny * width + nx;
            if (!seen[j] && score[j] > 0) {
              seen[j] = 1;
              stack[top++] = j;
            }
          }
        }
      }

      blobs.push({ area, redArea, strength, peak, x: sumX / strength / width, y: sumY / strength / height });
    }
    return blobs;
  };
}
