// In-memory app state shared between screens. Deliberately tiny: persistence
// (IndexedDB) arrives with sessions in milestone 7.

import { loadCalibration } from '../calibration/store.js';

export const appState = {
  /**
   * The saved target calibration, or null. Loaded from this device's storage
   * at startup and replaced by the calibration screen.
   * @type {import('../calibration/store.js').SavedCalibration | null}
   */
  calibration: loadCalibration(),

  /**
   * Result of the most recent camera check in this page load, or null.
   * @type {null | { source: string, observedFps: number | null, width: number, height: number, at: string }}
   */
  cameraCheck: null,
};
