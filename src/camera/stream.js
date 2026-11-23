// Camera stream helpers.
//
// UNVERIFIED ASSUMPTION: every value here is a *request*. Safari on iOS may
// ignore or clamp frame rate and resolution. Always read back what the track
// reports (describeTrack) and what the frame loop actually measures.

/**
 * Builds getUserMedia constraints using `ideal` values only, so an unsupported
 * request degrades instead of failing with OverconstrainedError.
 * @param {{ facingMode?: 'environment' | 'user', width?: number, height?: number, frameRate?: number }} [options]
 * @returns {MediaStreamConstraints}
 */
export function buildConstraints({ facingMode = 'environment', width = 1280, height = 720, frameRate = 30 } = {}) {
  return {
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: frameRate },
    },
  };
}

/** @param {MediaStreamConstraints} constraints */
export function openCamera(constraints) {
  return navigator.mediaDevices.getUserMedia(constraints);
}

/** @param {MediaStream | null | undefined} stream */
export function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Drops device identifiers: they add nothing to a diagnostics report. */
export function withoutDeviceIds(info) {
  if (!info) return info;
  const { deviceId, groupId, ...rest } = info;
  return rest;
}

/**
 * What the browser says about the active video track. `capabilities` is null
 * where getCapabilities is unavailable.
 * @param {MediaStream} stream
 * @param {{ includeLabel?: boolean }} [options] canvas-capture tracks use an opaque id as their label
 */
export function describeTrack(stream, { includeLabel = true } = {}) {
  const track = stream.getVideoTracks()[0];
  if (!track) return null;
  let capabilities = null;
  try {
    capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : null;
  } catch {
    capabilities = null;
  }
  return {
    label: includeLabel ? track.label : '(test pattern)',
    settings: withoutDeviceIds(track.getSettings()),
    capabilities: withoutDeviceIds(capabilities),
  };
}
