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

/** White space around the square on the printed sheet, mm: just enough for the corner marks. */
const SHEET_MARGIN_MM = 1.5;
/** Length of the ruler-check bar on the sheet at 100%, mm. */
export const SHEET_BAR_MM = 50;

/**
 * Size of the printed sheet's drawing in millimetres. It is kept barely larger
 * than the square itself: a drawing that does not fit inside the printer's
 * margins gets shrunk by the browser or the printer, and then nothing on it
 * is the size it says.
 * @param {TargetDefinition} target
 */
export function sheetSizeMm(target = getTarget()) {
  const side = target.squareMm + SHEET_MARGIN_MM * 2;
  return { width: side, height: side };
}

/**
 * The target as an SVG sized in real millimetres, for printing at 100%.
 * Light lines on white so a red dot stays visible everywhere on it.
 * The check bar and its caption sit inside the square, in the strip below the
 * rings, so the sheet is no taller than it is wide.
 * @param {TargetDefinition} target
 */
export function printableTargetSvg(target = getTarget()) {
  const margin = SHEET_MARGIN_MM;
  const side = target.squareMm;
  const { width, height } = sheetSizeMm(target);
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

  // The strip between the outer ring and the square's bottom edge.
  const barX = a + 22;
  const barY = b - 4.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="print-target" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" role="img" aria-label="${target.name} target, ${side} millimetre square">
    <rect width="${width}" height="${height}" fill="#fff"/>
    <rect x="${a}" y="${a}" width="${side}" height="${side}" fill="none" stroke="#000" stroke-width="0.8"/>
    ${brackets}
    <path d="M${c - target.outerRingRadiusMm} ${c}H${c + target.outerRingRadiusMm}M${c} ${c - target.outerRingRadiusMm}V${c + target.outerRingRadiusMm}" stroke="#999" stroke-width="0.2"/>
    ${rings.join('')}
    <g font-family="Arial, Helvetica, sans-serif" font-size="3.4" fill="#555">${labels.join('')}</g>
    <g font-family="Arial, Helvetica, sans-serif" font-size="3.2" fill="#000">
      <path d="M${barX} ${barY}h${SHEET_BAR_MM}M${barX} ${barY - 2}v4M${barX + SHEET_BAR_MM} ${barY - 2}v4" stroke="#000" stroke-width="0.4" fill="none"/>
      <text x="${barX + SHEET_BAR_MM + 3}" y="${barY + 1.1}">this bar: ${SHEET_BAR_MM} mm at 100% · square ${side} mm</text>
    </g>
  </svg>`;
}
