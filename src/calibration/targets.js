// Printed target definitions.
//
// A target is a printed square with scoring rings centred inside it. The
// square's four corners are what the user lines up during calibration; the
// known sizes then turn picture positions into ring scores and millimetres.

/**
 * @typedef {object} TargetDefinition
 * @property {string} id
 * @property {string} name
 * @property {number} squareMm          side of the printed calibration square, measured to the border's outer edge
 * @property {number} frameMm           thickness of the black border, which runs just inside the square's edge
 * @property {number} outerRingRadiusMm radius of the outermost scoring ring
 * @property {number} ringCount         rings, scoring ringCount at the centre down to 1
 */

/** @type {Record<string, TargetDefinition>} */
export const TARGETS = {
  'lr-10': {
    id: 'lr-10',
    name: 'LaserRange 10-ring',
    squareMm: 180,
    frameMm: 5,
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

/** Border thickness as a share of the square's side: what the square finder looks for. */
export function frameShare(target) {
  return target.frameMm / target.squareMm;
}

/** White space around the square on the printed sheet, mm. The page's own margin adds more. */
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
 * The square is drawn as a bold black border: its outer corners are the four
 * calibration corners, and the border is what the app looks for when it finds
 * the square by itself (calibration/findSquare.js). The check bar and its
 * caption sit inside the border, in the bottom-left corner clear of the
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

  const a = margin;
  const b = margin + side;
  const t = target.frameMm;

  // The bottom-left corner, between the outer ring and the border.
  const barX = a + t + 3;
  const barY = b - t - 3.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="print-target" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" role="img" aria-label="${target.name} target, ${side} millimetre square">
    <rect width="${width}" height="${height}" fill="#fff"/>
    <rect x="${a + t / 2}" y="${a + t / 2}" width="${side - t}" height="${side - t}" fill="none" stroke="#000" stroke-width="${t}"/>
    <path d="M${c - target.outerRingRadiusMm} ${c}H${c + target.outerRingRadiusMm}M${c} ${c - target.outerRingRadiusMm}V${c + target.outerRingRadiusMm}" stroke="#999" stroke-width="0.2"/>
    ${rings.join('')}
    <g font-family="Arial, Helvetica, sans-serif" font-size="3.4" fill="#555">${labels.join('')}</g>
    <g font-family="Arial, Helvetica, sans-serif" font-size="2.8" fill="#000">
      <path d="M${barX} ${barY}h${SHEET_BAR_MM}M${barX} ${barY - 1.2}v2.4M${barX + SHEET_BAR_MM} ${barY - 1.2}v2.4" stroke="#000" stroke-width="0.4" fill="none"/>
      <text x="${barX}" y="${barY - 3}">this bar: ${SHEET_BAR_MM} mm at 100%</text>
    </g>
  </svg>`;
}
