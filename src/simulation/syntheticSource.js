// A synthetic video source: a canvas drawn every animation frame and exposed as
// a MediaStream. It exercises the same frame loop, telemetry and detection as
// the camera without needing a camera, permission, or HTTPS.
//
// It is a software test pattern only. A display-rate canvas says nothing about
// how a real camera sensor captures a short laser flash.

/**
 * @param {object} [options]
 * @param {number} [options.width]
 * @param {number} [options.height]
 * @param {number} [options.fps]            capture rate requested from the canvas
 * @param {number} [options.flashEveryMs]   time between flashes
 * @param {number} [options.flashMs]        how long each flash stays lit; always drawn for at least one frame
 * @param {number} [options.flashIntensity] 0-1 opacity of the red dot
 * @param {number} [options.dotSize]        dot radius as a share of the shorter side
 * @param {(flash: { index: number, t: number, x: number, y: number }) => void} [options.onFlash]
 *   called when a flash is first drawn; t is on the performance clock, x/y are 0-1 across the frame
 * @returns {{ stream: MediaStream, stop: () => void }}
 */
export function createSyntheticSource({
  width = 640,
  height = 480,
  fps = 30,
  flashEveryMs = 1000,
  flashMs = 50,
  flashIntensity = 1,
  dotSize = 0.015,
  onFlash,
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  let started = null;
  let raf = 0;
  let frame = 0;
  let lastCycle = 0; // no flash during the first interval, so consumers can settle
  let flash = null;

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.4;
  const dotRadius = Math.max(2, Math.min(width, height) * dotSize);

  const draw = (now) => {
    if (started === null) started = now;
    const t = now - started;
    frame += 1;

    ctx.fillStyle = '#26323c';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#d9dfe3'; // "paper"
    ctx.fillRect(cx - radius * 1.15, cy - radius * 1.15, radius * 2.3, radius * 2.3);
    ctx.strokeStyle = '#3a4650';
    ctx.lineWidth = 2;
    for (let i = 1; i <= 5; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (radius * i) / 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // A sweeping bar so that every frame differs from the previous one.
    ctx.fillStyle = '#63d4af';
    ctx.fillRect(((t / 4) % (width + 40)) - 40, height - 10, 40, 6);

    // Start a new flash on the first frame of each interval. Starting it here,
    // rather than testing the clock, guarantees every flash is drawn at least once.
    const cycle = Math.floor(t / flashEveryMs);
    if (cycle > lastCycle) {
      lastCycle = cycle;
      const angle = cycle * 2.4;
      const dist = radius * (0.15 + 0.6 * ((cycle * 0.37) % 1));
      flash = { startedAt: t, px: cx + Math.cos(angle) * dist, py: cy + Math.sin(angle) * dist };
      onFlash?.({ index: cycle, t: now, x: flash.px / width, y: flash.py / height });
    }
    if (flash && t - flash.startedAt < Math.max(flashMs, 0.001)) {
      ctx.globalAlpha = flashIntensity;
      ctx.fillStyle = '#ff2a1a';
      ctx.beginPath();
      ctx.arc(flash.px, flash.py, dotRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      flash = null;
    }

    ctx.fillStyle = '#f5f8fa';
    ctx.font = '16px monospace';
    ctx.fillText(`SYNTHETIC TEST PATTERN  frame ${frame}`, 12, 24);

    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  const stream = canvas.captureStream(fps);
  return {
    stream,
    stop() {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}
