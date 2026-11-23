// Deterministic synthetic frames for tests: a noisy grey scene with optional
// red spots. Seeded, so every run produces identical pixels.
//
// These frames check the software's logic. They are not a model of a camera
// sensor, a lens, or a laser.

/** Small seeded pseudo-random generator returning values in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {{ width: number, height: number, seed?: number, base?: number, noise?: number }} options
 *   base: grey level of the scene (0-255); noise: +/- range added independently per channel per frame.
 * @returns {(frame?: { flashes?: { x: number, y: number, radius: number, intensity: number, core?: boolean }[], objects?: { x: number, y: number, w: number, h: number, color: number[] }[], brightness?: number }) => Uint8ClampedArray}
 *   flashes use normalised x/y (0-1), radius in pixels, intensity 0-1. `core: true` blows the centre out to white.
 *   objects are solid rectangles in pixel coordinates. brightness shifts the whole scene.
 */
export function createSceneRenderer({ width, height, seed = 1, base = 110, noise = 6 }) {
  const rand = mulberry32(seed);

  return function render({ flashes = [], objects = [], brightness = 0 } = {}) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let j = 0; j < data.length; j += 4) {
      data[j] = base + brightness + (rand() * 2 - 1) * noise;
      data[j + 1] = base + brightness + (rand() * 2 - 1) * noise;
      data[j + 2] = base + brightness + (rand() * 2 - 1) * noise;
      data[j + 3] = 255;
    }

    // Solid rectangles (pixel coordinates), e.g. something passing through view.
    for (const object of objects) {
      const x0 = Math.max(0, Math.round(object.x));
      const x1 = Math.min(width, Math.round(object.x + object.w));
      const y0 = Math.max(0, Math.round(object.y));
      const y1 = Math.min(height, Math.round(object.y + object.h));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const j = (y * width + x) * 4;
          data[j] = object.color[0];
          data[j + 1] = object.color[1];
          data[j + 2] = object.color[2];
        }
      }
    }

    for (const flash of flashes) {
      const cx = flash.x * width;
      const cy = flash.y * height;
      const r = flash.radius;
      const x0 = Math.max(0, Math.floor(cx - r));
      const x1 = Math.min(width - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r));
      const y1 = Math.min(height - 1, Math.ceil(cy + r));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d > r) continue;
          const j = (y * width + x) * 4;
          if (flash.core && flash.intensity > 0.8 && d <= r * 0.4) {
            data[j] = 255;
            data[j + 1] = 255;
            data[j + 2] = 255;
            continue;
          }
          // Full strength in the middle, fading linearly over the outer 40%.
          const falloff = d <= r * 0.6 ? 1 : (r - d) / (r * 0.4);
          const a = flash.intensity * falloff;
          data[j] += (255 - data[j]) * a;
          data[j + 1] += (40 - data[j + 1]) * a;
          data[j + 2] += (30 - data[j + 2]) * a;
        }
      }
    }
    return data;
  };
}
