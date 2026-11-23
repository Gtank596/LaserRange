// Reads a downscaled copy of the current video frame and computes cheap image
// statistics. This is the seed of the detection pipeline: it gives a realistic
// per-frame processing cost and a rough view of brightness and "redness".

/**
 * @param {Uint8ClampedArray | number[]} data RGBA bytes
 * @returns {{ meanLuma: number, peakRedness: number, saturatedFraction: number }}
 *   meanLuma 0-255; peakRedness 0-255 is the largest (R - max(G, B)) of any
 *   pixel; saturatedFraction 0-1 is the share of pixels with a channel >= 250.
 */
export function analyzePixels(data) {
  const pixels = data.length / 4;
  if (pixels === 0) return { meanLuma: 0, peakRedness: 0, saturatedFraction: 0 };
  let lumaSum = 0;
  let peakRedness = 0;
  let saturated = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    lumaSum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const redness = r - (g > b ? g : b);
    if (redness > peakRedness) peakRedness = redness;
    if (r >= 250 || g >= 250 || b >= 250) saturated += 1;
  }
  return { meanLuma: lumaSum / pixels, peakRedness, saturatedFraction: saturated / pixels };
}

/**
 * Copies the current video frame into a small RGBA buffer for the detector.
 * @param {{ width?: number }} [options] working width in pixels; height follows the video aspect ratio
 */
export function createFrameGrabber({ width = 320 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  return {
    /**
     * @param {HTMLVideoElement} video
     * @returns {{ data: Uint8ClampedArray, width: number, height: number } | null}
     */
    grab(video) {
      if (!ctx || !video.videoWidth || !video.videoHeight) return null;
      const height = Math.max(1, Math.round((width * video.videoHeight) / video.videoWidth));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.drawImage(video, 0, 0, width, height);
      return { data: ctx.getImageData(0, 0, width, height).data, width, height };
    },
  };
}

/**
 * @param {{ width?: number }} [options] working width in pixels; height follows the video aspect ratio
 */
export function createFrameSampler({ width = 160 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  return {
    /** @param {HTMLVideoElement} video */
    sample(video) {
      if (!ctx || !video.videoWidth || !video.videoHeight) return null;
      const height = Math.max(1, Math.round((width * video.videoHeight) / video.videoWidth));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      // Timed in three parts so we can see where the per-frame cost goes:
      // copying the video frame in, reading pixels back, and our own maths.
      const t0 = performance.now();
      ctx.drawImage(video, 0, 0, width, height);
      const t1 = performance.now();
      const { data } = ctx.getImageData(0, 0, width, height);
      const t2 = performance.now();
      const stats = analyzePixels(data);
      const t3 = performance.now();
      return {
        ...stats,
        width,
        height,
        timing: { drawMs: t1 - t0, readMs: t2 - t1, analyzeMs: t3 - t2 },
      };
    },
  };
}
