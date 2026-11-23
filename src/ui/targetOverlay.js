import { TEN_RING_TARGET } from '../calibration/scoring.js';

const R = 100; // SVG units for a normalised radius of 1

/**
 * SVG markup for a ring target with hit markers.
 * Hits are amber discs with a dark outline; the most recent one also gets a
 * halo ring, so "latest" is carried by shape as well as position.
 * @param {{ hits?: { x: number, y: number }[], label: string, target?: import('../calibration/scoring.js').TargetGeometry }} options
 */
export function targetOverlaySvg({ hits = [], label, target = TEN_RING_TARGET }) {
  const rings = [];
  for (let i = target.ringCount; i >= 2; i--) {
    const minor = i % 2 === 1 ? ' target__ring--minor' : '';
    rings.push(`<circle class="target__ring${minor}" r="${(i / target.ringCount) * R}"/>`);
  }
  const bull = `<circle class="target__bull" r="${R / target.ringCount}"/>`;
  const cross = `<path class="target__cross" d="M${-R} 0H${R}M0 ${-R}V${R}"/>`;

  const marks = hits
    .map((hit, i) => {
      const cx = (hit.x * R).toFixed(1);
      const cy = (hit.y * R).toFixed(1);
      const halo = i === hits.length - 1 ? `<circle class="target__hit-halo" cx="${cx}" cy="${cy}" r="7.5"/>` : '';
      return `${halo}<circle class="target__hit" cx="${cx}" cy="${cy}" r="4"/>`;
    })
    .join('');

  return `<svg class="target" viewBox="-106 -106 212 212" role="img" aria-label="${label}">${cross}${rings.join('')}${bull}${marks}</svg>`;
}

/** Legend explaining the marker shapes used by targetOverlaySvg. */
export const targetLegendHtml = `
  <ul class="legend" aria-label="Marker legend">
    <li><svg viewBox="-9 -9 18 18" aria-hidden="true"><circle class="target__hit" r="4"/></svg>Hit</li>
    <li><svg viewBox="-9 -9 18 18" aria-hidden="true"><circle class="target__hit-halo" r="7.5"/><circle class="target__hit" r="4"/></svg>Latest hit</li>
  </ul>`;
