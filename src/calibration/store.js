import { validateCorners } from './calibration.js';

// Saved calibration lives in localStorage: it is one small record, and it
// only makes sense on the device and camera position it was made with.
// (Sessions will use IndexedDB in milestone 7.)

const KEY = 'laserrange.calibration.v1';

/**
 * @typedef {object} SavedCalibration
 * @property {1} version
 * @property {string} targetId
 * @property {{ x: number, y: number }[]} corners  top-left, top-right, bottom-right, bottom-left; 0-1 of the frame
 * @property {{ width: number, height: number }} video  frame size it was made with
 * @property {string} source  'environment' | 'synthetic'
 * @property {string} savedAt ISO time
 */

const storage = () => (typeof localStorage === 'undefined' ? null : localStorage);

/** @returns {SavedCalibration | null} */
export function loadCalibration() {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !validateCorners(value.corners).ok || !value.video?.width) return null;
    return value;
  } catch {
    return null;
  }
}

/** @returns {boolean} false if the browser refused to store it (e.g. private mode) */
export function saveCalibration(calibration) {
  try {
    storage()?.setItem(KEY, JSON.stringify(calibration));
    return storage() !== null;
  } catch {
    return false;
  }
}

export function clearCalibration() {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

/** Whether a saved calibration was made with this source and frame size. */
export function calibrationFits(calibration, source, video) {
  return Boolean(
    calibration &&
      calibration.source === source &&
      calibration.video.width === video.videoWidth &&
      calibration.video.height === video.videoHeight,
  );
}
