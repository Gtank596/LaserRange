// Feature detection for the frame-access APIs that could replace the
// main-thread canvas readback. Some of them (notably MediaStreamTrackProcessor
// in Safari) may exist only inside a worker, so both scopes are probed.
// This only reports whether the APIs exist, not whether they perform well.

// The same checks as probeMainThreadFeatures, as source text for the worker.
const PROBE_EXPRESSION = `({
  mediaStreamTrackProcessor: typeof MediaStreamTrackProcessor !== 'undefined',
  videoFrame: typeof VideoFrame !== 'undefined',
  offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
  createImageBitmap: typeof createImageBitmap !== 'undefined',
})`;

export function probeMainThreadFeatures() {
  const scope = globalThis;
  return {
    mediaStreamTrackProcessor: typeof scope.MediaStreamTrackProcessor !== 'undefined',
    videoFrame: typeof scope.VideoFrame !== 'undefined',
    offscreenCanvas: typeof scope.OffscreenCanvas !== 'undefined',
    createImageBitmap: typeof scope.createImageBitmap !== 'undefined',
  };
}

/**
 * Runs the same probe inside a dedicated worker.
 * @returns {Promise<Record<string, boolean> | null>} null when workers are unavailable or do not answer in time
 */
export function probeWorkerFeatures(timeoutMs = 1500) {
  return new Promise((resolve) => {
    let worker = null;
    let url = '';
    let timer = 0;
    const finish = (result) => {
      clearTimeout(timer);
      worker?.terminate();
      if (url) URL.revokeObjectURL(url);
      resolve(result);
    };
    try {
      url = URL.createObjectURL(new Blob([`postMessage(${PROBE_EXPRESSION});`], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = (event) => finish(event.data);
      worker.onerror = () => finish(null);
      timer = setTimeout(() => finish(null), timeoutMs);
    } catch {
      finish(null);
    }
  });
}
