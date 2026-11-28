// In-memory app state shared between screens. Deliberately tiny: saved
// sessions live in IndexedDB (sessions/store.js), not here.

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

  /**
   * Choices made on the session screen, kept for the next session in this
   * page load. Defaults are the everyday ones.
   * targetMode: 'auto' finds the printed target when the session starts,
   * 'saved' uses the corners placed by hand, 'none' counts hits without a target.
   * @type {{ source: 'environment' | 'synthetic', redDelta: number, dotLimit: 'normal' | 'large', targetMode: 'auto' | 'saved' | 'none' }}
   */
  sessionOptions: { source: 'environment', redDelta: 60, dotLimit: 'normal', targetMode: 'auto' },
};
