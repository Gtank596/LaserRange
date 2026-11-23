// Per-frame scheduling for a <video> element.
//
// Preferred: requestVideoFrameCallback (rVFC), which fires once per frame the
// browser presents and reports frame metadata. Fallback: requestAnimationFrame,
// which fires at display rate, so we only report when the video time advances.
//
// UNVERIFIED ASSUMPTION: rVFC reports frames the browser *presented*. That is
// not guaranteed to equal every frame the sensor captured, and the metadata
// fields available for camera streams differ between browsers.

/**
 * @typedef {object} FrameInfo
 * @property {number} now            callback timestamp, ms (performance clock)
 * @property {number} [mediaTime]    media timeline position, seconds
 * @property {number} [presentedFrames] running count of frames presented
 * @property {number} [captureTime]  capture timestamp, ms (rarely provided)
 * @property {'rvfc' | 'raf'} method
 */

export function frameLoopMethod() {
  return typeof HTMLVideoElement !== 'undefined' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype
    ? 'rvfc'
    : 'raf';
}

/**
 * Calls onFrame for each new video frame until the returned function is called.
 * @param {HTMLVideoElement} video
 * @param {(frame: FrameInfo) => void} onFrame
 * @returns {() => void} stop
 */
export function startFrameLoop(video, onFrame) {
  let stopped = false;
  let handle = 0;

  if (frameLoopMethod() === 'rvfc') {
    const step = (now, meta) => {
      if (stopped) return;
      onFrame({
        now,
        mediaTime: meta.mediaTime,
        presentedFrames: meta.presentedFrames,
        captureTime: meta.captureTime,
        method: 'rvfc',
      });
      handle = video.requestVideoFrameCallback(step);
    };
    handle = video.requestVideoFrameCallback(step);
    return () => {
      stopped = true;
      video.cancelVideoFrameCallback(handle);
    };
  }

  let lastTime = -1;
  const step = (now) => {
    if (stopped) return;
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      onFrame({ now, mediaTime: video.currentTime, method: 'raf' });
    }
    handle = requestAnimationFrame(step);
  };
  handle = requestAnimationFrame(step);
  return () => {
    stopped = true;
    cancelAnimationFrame(handle);
  };
}
