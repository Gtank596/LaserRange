// Turns camera failures into plain-language messages. Pure functions so the
// wording and classification can be unit tested without a browser.

/** @typedef {{ code: string, title: string, detail: string }} CameraProblem */

/**
 * Checks the preconditions for getUserMedia before asking for the camera.
 * @param {{ isSecureContext: boolean, hasMediaDevices: boolean }} env
 * @returns {{ ok: true } | ({ ok: false } & CameraProblem)}
 */
export function checkCameraSupport({ isSecureContext, hasMediaDevices }) {
  if (!isSecureContext) {
    return {
      ok: false,
      code: 'insecure-context',
      title: 'Camera needs a secure (HTTPS) page',
      detail:
        'Browsers only allow camera access on https:// pages or on localhost. Open the https:// address of this app instead of http://.',
    };
  }
  if (!hasMediaDevices) {
    return {
      ok: false,
      code: 'unsupported',
      title: 'This browser cannot open the camera',
      detail: 'Camera access (getUserMedia) is not available here. On iPhone, use Safari or the installed home-screen app.',
    };
  }
  return { ok: true };
}

/**
 * Maps an error thrown by getUserMedia / video playback to a user-facing problem.
 * @param {unknown} error
 * @returns {CameraProblem}
 */
export function describeCameraError(error) {
  const name = /** @type {{ name?: string }} */ (error)?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return {
        code: 'permission-denied',
        title: 'Camera permission was not granted',
        detail:
          'Allow camera access to continue. On iPhone this is set from the page menu in Safari\'s address bar (Website Settings), or in the Settings app under Safari, Camera. Then try again.',
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return {
        code: 'no-camera',
        title: 'No camera was found',
        detail: 'This device did not report a camera. You can still try the synthetic test pattern.',
      };
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        code: 'camera-busy',
        title: 'The camera could not be started',
        detail: 'Another app or tab may be using it. Close other camera apps and try again.',
      };
    case 'OverconstrainedError':
      return {
        code: 'unsupported-settings',
        title: 'The camera rejected the requested settings',
        detail: 'Try a lower resolution or frame rate.',
      };
    case 'AbortError':
      return {
        code: 'aborted',
        title: 'Starting the camera was interrupted',
        detail: 'Try again.',
      };
    default: {
      const message = /** @type {{ message?: string }} */ (error)?.message;
      return {
        code: 'unknown',
        title: 'The camera could not be started',
        detail: message ? `Unexpected error: ${name || 'Error'}: ${message}` : 'An unexpected error occurred.',
      };
    }
  }
}
