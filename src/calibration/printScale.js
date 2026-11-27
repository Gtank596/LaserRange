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

/** 47.5 -> 0.95. Anything unusable -> 1 (printed at full size, as far as the app knows). */
export function printScaleFromBar(barMm) {
  const value = parseBarMm(barMm);
  return value === null ? 1 : value / CHECK_BAR_MM;
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

/** @returns {boolean} false if the measurement is unusable or the browser refused to store it */
export function saveBarMm(barMm, storage = deviceStorage(), now = new Date()) {
  const value = parseBarMm(barMm);
  if (value === null || !storage) return false;
  try {
    storage.setItem(KEY, JSON.stringify({ barMm: value, savedAt: now.toISOString() }));
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
