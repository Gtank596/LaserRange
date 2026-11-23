// Printed target definitions.
//
// A target is a printed square with scoring rings centred inside it. The
// square's four corners are what the user lines up during calibration; the
// known sizes then turn picture positions into ring scores and millimetres.

/**
 * @typedef {object} TargetDefinition
 * @property {string} id
 * @property {string} name
 * @property {number} squareMm          side of the printed calibration square
 * @property {number} outerRingRadiusMm radius of the outermost scoring ring
 * @property {number} ringCount         rings, scoring ringCount at the centre down to 1
 */

/** @type {Record<string, TargetDefinition>} */
export const TARGETS = {
  'lr-10': {
    id: 'lr-10',
    name: 'LaserRange 10-ring',
    squareMm: 180,
    outerRingRadiusMm: 80,
    ringCount: 10,
  },
};

export const DEFAULT_TARGET_ID = 'lr-10';

/** @returns {TargetDefinition} */
export function getTarget(id = DEFAULT_TARGET_ID) {
  return TARGETS[id] ?? TARGETS[DEFAULT_TARGET_ID];
}

/** Outer ring radius as a share of half the square's side (0-1). */
export function ringShare(target) {
  return target.outerRingRadiusMm / (target.squareMm / 2);
}

/**
 * The target as an SVG sized in real millimetres, for printing at 100%.
 * Light lines on white so a red dot stays visible everywhere on it.
 * @param {TargetDefinition} target
 */
export function printableTargetSvg(target = getTarget()) {
  const margin = 5;
  const side = target.squareMm;
  const width = side + margin * 2;
  const height = side + margin * 2 + 20;
  const c = margin + side / 2;
  const step = target.outerRingRadiusMm / target.ringCount;

  const rings = [];
  const labels = [];
  for (let k = target.ringCount; k >= 1; k--) {
    const r = k * step;
    rings.push(`<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#333" stroke-width="${k % 2 === 0 ? 0.5 : 0.3}"/>`);
    const score = target.ringCount - k + 1;
    if (score < target.ringCount) {
      labels.push(`<text x="${c + r - step / 2}" y="${c + 1.2}" text-anchor="middle">${score}</text>`);
      labels.push(`<text x="${c}" y="${c - r + step / 2 + 1.2}" text-anchor="middle">${score}</text>`);
    }
  }

  // Heavy corner brackets make the square's corners easy to find in the camera view.
  const a = margin;
  const b = margin + side;
  const len = 14;
  const brackets = [
    `M${a} ${a + len}V${a}H${a + len}`,
    `M${b - len} ${a}H${b}V${a + len}`,
    `M${b} ${b - len}V${b}H${b - len}`,
    `M${a + len} ${b}H${a}V${b - len}`,
  ]
    .map((d) => `<path d="${d}" fill="none" stroke="#000" stroke-width="2.4" stroke-linecap="square"/>`)
    .join('');

  const footY = b + 9;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="print-target" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" role="img" aria-label="${target.name} target, ${side} millimetre square">
    <rect width="${width}" height="${height}" fill="#fff"/>
    <rect x="${a}" y="${a}" width="${side}" height="${side}" fill="none" stroke="#000" stroke-width="0.8"/>
    ${brackets}
    <path d="M${c - target.outerRingRadiusMm} ${c}H${c + target.outerRingRadiusMm}M${c} ${c - target.outerRingRadiusMm}V${c + target.outerRingRadiusMm}" stroke="#999" stroke-width="0.2"/>
    ${rings.join('')}
    <g font-family="Arial, Helvetica, sans-serif" font-size="3.4" fill="#555">${labels.join('')}</g>
    <g font-family="Arial, Helvetica, sans-serif" font-size="3.6" fill="#000">
      <text x="${a}" y="${footY}">${target.name} · square ${side} mm · print at 100% (actual size)</text>
      <path d="M${a} ${footY + 6}h50M${a} ${footY + 4}v4M${a + 50} ${footY + 4}v4" stroke="#000" stroke-width="0.4" fill="none"/>
      <text x="${a + 53}" y="${footY + 7.2}">this bar should measure 50 mm</text>
    </g>
  </svg>`;
}
