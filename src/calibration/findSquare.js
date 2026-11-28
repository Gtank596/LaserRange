import { applyHomography, computeHomography, isConvexQuad, signedArea } from './homography.js';

// Finds the printed target's black border in one video frame, so the four
// corners do not have to be placed by hand.
//
// How it works:
//   1. Each pixel is compared with the average brightness around it. Pixels
//      clearly darker than their surroundings are "ink". Comparing locally,
//      not against one fixed level, copes with uneven room lighting.
//   2. Touching ink pixels are grouped. The border is one such group: a big,
//      mostly hollow, four-sided loop.
//   3. For each candidate group, its outline is reduced to four corners, and
//      each side is then re-drawn as the best straight line through the
//      outline's own pixels, so a corner lands between pixels, not on one.
//   4. The candidate is accepted only if the picture really shows a border
//      there: dark along the band where the border should be, and light both
//      just inside it and just outside it, on all four sides. This is what
//      tells the border from a dark shadow around the paper, a picture frame,
//      or a window.
//
// UNVERIFIED ASSUMPTION: this has only been run on drawn pictures (unit tests
// and the app's test pattern), not on a photo of the printed sheet. Real paper
// brings glare, curl, shadows and a busy background.
//
// What it cannot do: tell how big the sheet is. A smaller sheet closer to the
// camera makes exactly the same picture as a bigger one further away.

/** @typedef {import('./homography.js').Point} Point */

const UNIT_SQUARE = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export const FIND_DEFAULTS = Object.freeze({
  /** Border thickness as a share of the square's side (5 mm of 180 mm). */
  frameShare: 5 / 180,
  /** A pixel is ink when it is darker than this share of the average around it. */
  darkRatio: 0.78,
  /** Half-size of the area averaged around each pixel, as a share of the picture's longer side. */
  windowShare: 0.06,
  /** The square must be at least this share of the picture's shorter side. */
  minSideShare: 0.12,
  /** The border band must be darker than this share of the paper beside it. */
  contrastRatio: 0.68,
  /** Share of sample points on each side that must agree. */
  agreeShare: 0.8,
});

/** Brightness (0-255) of each pixel of an RGBA buffer. */
export function toGray(rgba, width, height) {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
  return gray;
}

/** 1 where a pixel is clearly darker than the average of the square area around it. */
export function inkMask(gray, width, height, radius, darkRatio) {
  // Summed-area table: the total of any rectangle in four look-ups.
  const stride = width + 1;
  const sums = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += gray[y * width + x];
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row;
    }
  }
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const total = sums[y1 * stride + x1] - sums[y0 * stride + x1] - sums[y1 * stride + x0] + sums[y0 * stride + x0];
      const mean = total / ((x1 - x0) * (y1 - y0));
      if (gray[y * width + x] < mean * darkRatio) mask[y * width + x] = 1;
    }
  }
  return mask;
}

/**
 * Groups touching ink pixels (including diagonal neighbours).
 * @returns {{ labels: Int32Array, groups: { id: number, count: number, x0: number, y0: number, x1: number, y1: number }[] }}
 */
export function groupInk(mask, width, height) {
  const labels = new Int32Array(width * height);
  const stack = new Int32Array(width * height);
  const groups = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const id = groups.length + 1;
    const group = { id, count: 0, x0: width, y0: height, x1: 0, y1: 0 };
    let top = 0;
    stack[top++] = start;
    labels[start] = id;
    while (top > 0) {
      const index = stack[--top];
      const x = index % width;
      const y = (index - x) / width;
      group.count += 1;
      if (x < group.x0) group.x0 = x;
      if (x > group.x1) group.x1 = x;
      if (y < group.y0) group.y0 = y;
      if (y > group.y1) group.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const next = ny * width + nx;
          if (mask[next] && !labels[next]) {
            labels[next] = id;
            stack[top++] = next;
          }
        }
      }
    }
    groups.push(group);
  }
  return { labels, groups };
}

/** The outermost pixels of a group: first and last in every row and every column of its box. */
function outlinePoints(labels, width, group) {
  const points = [];
  for (let y = group.y0; y <= group.y1; y++) {
    let first = -1;
    let last = -1;
    for (let x = group.x0; x <= group.x1; x++) {
      if (labels[y * width + x] !== group.id) continue;
      if (first < 0) first = x;
      last = x;
    }
    if (first < 0) continue;
    points.push({ x: first, y });
    if (last !== first) points.push({ x: last, y });
  }
  for (let x = group.x0; x <= group.x1; x++) {
    let first = -1;
    let last = -1;
    for (let y = group.y0; y <= group.y1; y++) {
      if (labels[y * width + x] !== group.id) continue;
      if (first < 0) first = y;
      last = y;
    }
    if (first < 0) continue;
    points.push({ x, y: first });
    if (last !== first) points.push({ x, y: last });
  }
  return points;
}

const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** The smallest shape with no inward corners that holds all the points (Andrew's monotone chain). */
export function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Four corners from an outline with no inward corners: the two points furthest
 * apart, and the point furthest from the line between them on each side.
 * @returns {Point[] | null} in order around the shape
 */
function fourCorners(hull) {
  if (hull.length < 4) return null;
  let best = -1;
  let a = hull[0];
  let c = hull[0];
  for (let i = 0; i < hull.length; i++) {
    for (let j = i + 1; j < hull.length; j++) {
      const d = (hull[i].x - hull[j].x) ** 2 + (hull[i].y - hull[j].y) ** 2;
      if (d > best) {
        best = d;
        a = hull[i];
        c = hull[j];
      }
    }
  }
  let b = null;
  let d = null;
  let bDist = 0;
  let dDist = 0;
  for (const p of hull) {
    const side = cross(a, c, p);
    if (side > bDist) {
      bDist = side;
      b = p;
    } else if (-side > dDist) {
      dDist = -side;
      d = p;
    }
  }
  return b && d ? [a, b, c, d] : null;
}

/** Best straight line through points, as a point on it and its direction (total least squares). */
function fitLine(points) {
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= points.length;
  my /= points.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { x: mx, y: my, dx: Math.cos(angle), dy: Math.sin(angle) };
}

function intersect(l1, l2) {
  const det = l1.dx * l2.dy - l1.dy * l2.dx;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((l2.x - l1.x) * l2.dy - (l2.y - l1.y) * l2.dx) / det;
  return { x: l1.x + l1.dx * t, y: l1.y + l1.dy * t };
}

/**
 * Re-draws each side as the best line through the outline pixels along it and
 * returns where neighbouring lines cross. Pixel positions are pixel centres;
 * the true edge is half a pixel further out, so each line is moved out by that.
 */
function refineCorners(quad, outline) {
  const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
  const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
  const lines = [];
  for (let i = 0; i < 4; i++) {
    const p = quad[i];
    const q = quad[(i + 1) % 4];
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    const ux = (q.x - p.x) / length;
    const uy = (q.y - p.y) / length;
    const tolerance = Math.max(2, length * 0.02);
    const near = [];
    for (const point of outline) {
      const along = (point.x - p.x) * ux + (point.y - p.y) * uy;
      if (along < length * 0.08 || along > length * 0.92) continue; // keep clear of the corners
      const off = Math.abs((point.x - p.x) * uy - (point.y - p.y) * ux);
      if (off <= tolerance) near.push(point);
    }
    const line = near.length >= 8 ? fitLine(near) : { x: p.x, y: p.y, dx: ux, dy: uy };
    // Move the line half a pixel away from the middle of the shape.
    let nx = -line.dy;
    let ny = line.dx;
    if ((line.x - cx) * nx + (line.y - cy) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    lines.push({ x: line.x + nx * 0.5, y: line.y + ny * 0.5, dx: line.dx, dy: line.dy });
  }
  const corners = [];
  for (let i = 0; i < 4; i++) {
    const corner = intersect(lines[(i + 3) % 4], lines[i]);
    if (!corner) return null;
    corners.push(corner);
  }
  return corners;
}

/** Puts four corners in the order the app uses: top-left first, then clockwise as seen in the picture. */
export function orderCorners(corners) {
  const cx = corners.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = corners.reduce((sum, p) => sum + p.y, 0) / 4;
  const around = [...corners].sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
  let first = 0;
  for (let i = 1; i < 4; i++) if (around[i].x + around[i].y < around[first].x + around[first].y) first = i;
  return [0, 1, 2, 3].map((i) => around[(first + i) % 4]);
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/**
 * Checks that the picture shows a printed border at these corners: dark along
 * the border band, light just inside it and just outside it, on every side.
 * @returns {{ ok: boolean, contrast: number }} contrast: border brightness over paper brightness, worst side (lower is better)
 */
function looksLikeBorder(gray, width, height, corners, options) {
  const toImage = computeHomography(UNIT_SQUARE, corners);
  if (!toImage) return { ok: false, contrast: 1 };
  const f = options.frameShare;
  const sample = (u, v) => {
    const p = applyHomography(toImage, u, v);
    const x = Math.round(p.x - 0.5);
    const y = Math.round(p.y - 0.5);
    return x < 0 || y < 0 || x >= width || y >= height ? null : gray[y * width + x];
  };
  // A point at distance `along` (0-1) down a side and `depth` in from it, for each of the four sides.
  const sides = [(a, d) => [a, d], (a, d) => [1 - d, a], (a, d) => [1 - a, 1 - d], (a, d) => [d, 1 - a]];
  let worst = 0;
  for (const side of sides) {
    const border = [];
    const inside = [];
    const outside = [];
    for (let step = 0; step < 28; step++) {
      const along = 0.1 + (0.8 * step) / 27;
      border.push(sample(...side(along, f * 0.5)));
      inside.push(sample(...side(along, f * 1.4)));
      outside.push(sample(...side(along, -f * 0.8)));
    }
    if ([...border, ...inside, ...outside].some((value) => value === null)) return { ok: false, contrast: 1 };
    const paper = Math.min(median(inside), median(outside));
    const limit = paper * options.contrastRatio;
    const darkEnough = border.filter((value) => value < limit).length / border.length;
    const lightInside = inside.filter((value) => value >= limit).length / inside.length;
    const lightOutside = outside.filter((value) => value >= limit).length / outside.length;
    if (darkEnough < options.agreeShare || lightInside < options.agreeShare || lightOutside < options.agreeShare) return { ok: false, contrast: 1 };
    worst = Math.max(worst, median(border) / Math.max(1, paper));
  }
  return { ok: true, contrast: worst };
}

/**
 * Looks for the printed target's border in one picture.
 * @param {Uint8ClampedArray | Uint8Array} rgba pixel data, 4 bytes per pixel
 * @param {number} width
 * @param {number} height
 * @param {Partial<typeof FIND_DEFAULTS>} [overrides]
 * @returns {{ found: true, corners: Point[], contrast: number, sidePx: number } | { found: false, reason: 'nothing' | 'unclear' }}
 *   corners: top-left, top-right, bottom-right, bottom-left as 0-1 shares of the picture.
 *   reason 'nothing': no border-like shape at all; 'unclear': shapes were there but none looked like the printed border.
 */
export function findTargetSquare(rgba, width, height, overrides = {}) {
  const options = { ...FIND_DEFAULTS, ...overrides };
  const gray = toGray(rgba, width, height);
  const radius = Math.max(6, Math.round(Math.max(width, height) * options.windowShare));
  const mask = inkMask(gray, width, height, radius, options.darkRatio);
  const { labels, groups } = groupInk(mask, width, height);

  const minSide = Math.min(width, height) * options.minSideShare;
  const candidates = groups
    .filter((group) => {
      const w = group.x1 - group.x0 + 1;
      const h = group.y1 - group.y0 + 1;
      if (w < minSide || h < minSide) return false;
      // The border is hollow: it covers a small share of the box around it.
      const fill = group.count / (w * h);
      return fill > 0.02 && fill < 0.5;
    })
    .sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))
    .slice(0, 8);
  if (candidates.length === 0) return { found: false, reason: 'nothing' };

  let best = null;
  for (const group of candidates) {
    const outline = outlinePoints(labels, width, group);
    const hull = convexHull(outline);
    const rough = fourCorners(hull);
    if (!rough || !isConvexQuad(rough)) continue;
    // A four-sided outline loses almost nothing when cut down to four corners.
    if (Math.abs(signedArea(rough)) < Math.abs(signedArea(hull)) * 0.9) continue;
    const refined = refineCorners(rough, outline);
    if (!refined || !isConvexQuad(refined)) continue;
    // Pixel centres sit at +0.5, so shift into the picture's own coordinates.
    const corners = orderCorners(refined.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 })));
    const lengths = corners.map((p, i) => Math.hypot(corners[(i + 1) % 4].x - p.x, corners[(i + 1) % 4].y - p.y));
    if (Math.min(...lengths) < minSide) continue;
    if (Math.max(...lengths) > Math.min(...lengths) * 3) continue; // far too steep an angle to be useful
    const check = looksLikeBorder(gray, width, height, corners, options);
    if (!check.ok) continue;
    const area = Math.abs(signedArea(corners));
    if (!best || area > best.area) best = { corners, area, contrast: check.contrast, sidePx: lengths.reduce((sum, value) => sum + value, 0) / 4 };
  }
  if (!best) return { found: false, reason: 'unclear' };
  return {
    found: true,
    corners: best.corners.map((p) => ({ x: p.x / width, y: p.y / height })),
    contrast: best.contrast,
    sidePx: best.sidePx,
  };
}
