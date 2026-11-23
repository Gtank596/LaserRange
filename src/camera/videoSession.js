import { createSyntheticSource } from '../simulation/syntheticSource.js';
import { checkCameraSupport, describeCameraError } from './errors.js';
import { buildConstraints, openCamera, stopStream } from './stream.js';

/**
 * Opens a camera or the test pattern and plays it in a <video> element.
 *
 * @param {HTMLVideoElement} video
 * @param {{ source: 'environment' | 'user' | 'synthetic', width?: number, height?: number, frameRate?: number, synthetic?: object }} options
 *   `synthetic` is passed to createSyntheticSource when source is 'synthetic'.
 * @returns {Promise<{ ok: false, problem: import('./errors.js').CameraProblem } | { ok: true, session: { isSynthetic: boolean, stream: MediaStream, synthetic: ReturnType<typeof createSyntheticSource> | null, onEnded: (callback: () => void) => void, stop: () => void } }>}
 */
export async function startVideoSession(video, { source, width = 1280, height = 720, frameRate = 60, synthetic: syntheticOptions = {} }) {
  const isSynthetic = source === 'synthetic';
  if (!isSynthetic) {
    const support = checkCameraSupport({
      isSecureContext: window.isSecureContext,
      hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
    });
    if (!support.ok) return { ok: false, problem: support };
  }

  let stream = null;
  let synthetic = null;
  const release = () => {
    if (synthetic) synthetic.stop();
    else stopStream(stream);
    video.srcObject = null;
  };

  try {
    if (isSynthetic) {
      synthetic = createSyntheticSource({ fps: frameRate, width, height, ...syntheticOptions });
      stream = synthetic.stream;
    } else {
      stream = await openCamera(buildConstraints({ facingMode: source, width, height, frameRate }));
    }
    video.srcObject = stream;
    await video.play();
  } catch (error) {
    release();
    return { ok: false, problem: describeCameraError(error) };
  }

  const track = stream.getVideoTracks()[0];
  let endedHandler = null;
  const onTrackEnded = () => endedHandler?.();
  track?.addEventListener('ended', onTrackEnded);

  return {
    ok: true,
    session: {
      isSynthetic,
      stream,
      synthetic,
      /** Called if the system stops the camera (a call, a lock, another app). */
      onEnded(callback) {
        endedHandler = callback;
      },
      stop() {
        track?.removeEventListener('ended', onTrackEnded);
        release();
      },
    },
  };
}
