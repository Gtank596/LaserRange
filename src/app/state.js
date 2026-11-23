// In-memory app state shared between screens. Deliberately tiny: persistence
// (IndexedDB) arrives with sessions in milestone 7.

export const appState = {
  /**
   * Result of the most recent camera check in this page load, or null.
   * @type {null | { source: string, observedFps: number | null, width: number, height: number, at: string }}
   */
  cameraCheck: null,
};
