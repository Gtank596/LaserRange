// How big the target sheet actually came out of the printer.
//
// The sheet carries a bar that is 50 mm long when printed at 100%. Printers
// and print dialogs often shrink a page a few percent ("fit to page"), so the
// app lets the bar be measured with a ruler and the result entered. Ring
// scores never depend on this: they come from where a hit falls inside the
// printed square, whatever its size. Only figures in millimetres (group size)
// are multiplied by the print scale.
//
// The measurement lives in localStorage, like the saved calibration, and each
// scored session keeps a copy of the scale it was run with.

export const CHECK_BAR_MM = 50;
export const MM_PER_INCH = 25.4;
/** A measurement outside this range is taken as a slip of the finger, not a print scale. */
export const BAR_RANGE_MM = Object.freeze({ min: 25, max: 100 });

const KEY = 'laserrange.print.v1';
const deviceStorage = () => (typeof localStorage === 'undefined' ? null : localStorage);

/** Accepts "47.5" or "47,5". Returns null when it is not a usable measurement. */
export function parseBarMm(text) {
  const value = typeof text === 'number' ? text : Number(String(text).trim().replace(',', '.'));
  if (!Number.isFinite(value) || value < BAR_RANGE_MM.min || value > BAR_RANGE_MM.max) return null;
  return Math.round(value * 10) / 10;
}

/**
 * Reads a length as someone would write it off a ruler: "49.2", "49,2",
 * "1 15/16", "1-15/16", "15/16", with or without a unit after it.
 * @returns {number | null} the number as written (no unit conversion), or null
 */
export function parseLength(text) {
  const cleaned = String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/(mm|inches|inch|in\.?|["”″])$/, '')
    .trim()
    .replace(',', '.');
  const fraction = cleaned.match(/^(?:(\d+)(?:\s+|\s*-\s*))?(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const [, whole, top, bottom] = fraction;
    if (Number(bottom) === 0) return null;
    return Number(whole ?? 0) + Number(top) / Number(bottom);
  }
  return /^(\d+\.?\d*|\.\d+)$/.test(cleaned) ? Number(cleaned) : null;
}

/**
 * Turns a ruler measurement of the bar, or of one side of the square, into
 * the length the bar would measure in millimetres. Measuring the square is
 * the finer check: it is longer, so the same slip on the ruler matters less.
 * @param {string | number} text what was read off the ruler
 * @param {{ unit?: 'mm' | 'in', fullSizeMm?: number }} [how] fullSizeMm: the measured feature's length at 100%
 * @returns {number | null}
 */
export function barMmFromMeasurement(text, { unit = 'mm', fullSizeMm = CHECK_BAR_MM } = {}) {
  const value = parseLength(text);
  if (value === null) return null;
  const mm = unit === 'in' ? value * MM_PER_INCH : value;
  return parseBarMm((mm * CHECK_BAR_MM) / fullSizeMm);
}

/** 47.5 -> 0.95. Anything unusable -> 1 (printed at full size, as far as the app knows). */
export function printScaleFromBar(barMm) {
  const value = parseBarMm(barMm);
  // Four decimal places: finer than any ruler, and it keeps 47.6 / 50 from being saved as 0.9520000000000001.
  return value === null ? 1 : Math.round((value / CHECK_BAR_MM) * 10000) / 10000;
}

/** A usable print scale from a saved session, or 1. */
export function safePrintScale(scale) {
  return Number.isFinite(scale) && scale >= BAR_RANGE_MM.min / CHECK_BAR_MM && scale <= BAR_RANGE_MM.max / CHECK_BAR_MM ? scale : 1;
}

/** @returns {number | null} the measured length of the bar in mm, or null if none was entered */
export function loadBarMm(storage = deviceStorage()) {
  try {
    const value = JSON.parse(storage?.getItem(KEY) ?? 'null');
    return value ? parseBarMm(value.barMm) : null;
  } catch {
    return null;
  }
}

/**
 * How the saved measurement was entered, so the print screen can show it back
 * the way it was typed.
 * @returns {{ text: string, unit: 'mm' | 'in', of: 'bar' | 'square' } | null}
 */
export function loadBarEntry(storage = deviceStorage()) {
  try {
    const entry = JSON.parse(storage?.getItem(KEY) ?? 'null')?.entry;
    if (!entry || typeof entry.text !== 'string') return null;
    return { text: entry.text, unit: entry.unit === 'in' ? 'in' : 'mm', of: entry.of === 'square' ? 'square' : 'bar' };
  } catch {
    return null;
  }
}

/**
 * @param {number | string} barMm the bar's length in mm (see barMmFromMeasurement)
 * @param {{ text: string, unit: 'mm' | 'in', of: 'bar' | 'square' }} [entry] what was typed, kept for display only
 * @returns {boolean} false if the measurement is unusable or the browser refused to store it
 */
export function saveBarMm(barMm, storage = deviceStorage(), now = new Date(), entry = undefined) {
  const value = parseBarMm(barMm);
  if (value === null || !storage) return false;
  try {
    storage.setItem(KEY, JSON.stringify({ barMm: value, savedAt: now.toISOString(), ...(entry ? { entry } : {}) }));
    return true;
  } catch {
    return false;
  }
}

export function clearBarMm(storage = deviceStorage()) {
  try {
    storage?.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

/** The print scale to use for a new session: from the saved measurement, or 1. */
export function loadPrintScale(storage = deviceStorage()) {
  return printScaleFromBar(loadBarMm(storage));
}
