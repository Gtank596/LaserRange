// A synthetic video source: a canvas drawn every animation frame and exposed as
// a MediaStream. It exercises the same frame loop, telemetry and detection as
// the camera without needing a camera, permission, or HTTPS.
//
// It is a software test pattern only. A display-rate canvas says nothing about
// how a real camera sensor captures a short laser flash.

import { frameShare, getTarget, ringShare } from '../calibration/targets.js';

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
 * @returns {{ stream: MediaStream, corners: { x: number, y: number }[], stats: () => object, stop: () => void }}
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

  // The drawn "paper" follows the real printed target's proportions, so the
  // calibration screen can be tried on it: a square with the rings inside.
  const target = getTarget();
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.4; // outer ring
  const halfSide = radius / ringShare(target); // half the square's side
  const border = halfSide * 2 * frameShare(target); // the black border's thickness
  const paperMargin = halfSide * 2 * (6 / target.squareMm); // paper showing around the square
  const dotRadius = Math.max(2, Math.min(width, height) * dotSize);
  const corners = [
    { x: (cx - halfSide) / width, y: (cy - halfSide) / height },
    { x: (cx + halfSide) / width, y: (cy - halfSide) / height },
    { x: (cx + halfSide) / width, y: (cy + halfSide) / height },
    { x: (cx - halfSide) / width, y: (cy + halfSide) / height },
  ];

  const draw = (now) => {
    if (started === null) started = now;
    const t = now - started;
    frame += 1;

    ctx.fillStyle = '#26323c';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#d9dfe3'; // "paper"
    ctx.fillRect(cx - halfSide - paperMargin, cy - halfSide - paperMargin, (halfSide + paperMargin) * 2, (halfSide + paperMargin) * 2);
    // The printed square's black border: its outer edge is the square.
    ctx.strokeStyle = '#161c21';
    ctx.lineWidth = border;
    ctx.strokeRect(cx - halfSide + border / 2, cy - halfSide + border / 2, halfSide * 2 - border, halfSide * 2 - border);
    ctx.strokeStyle = '#3a4650';
    for (let i = 1; i <= target.ringCount; i++) {
      ctx.lineWidth = i % 2 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.arc(cx, cy, (radius * i) / target.ringCount, 0, Math.PI * 2);
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
      onFlash?.({
        index: cycle,
        t: now,
        x: flash.px / width,
        y: flash.py / height,
        // The same position in target coordinates (1 = outer ring radius).
        targetX: (flash.px - cx) / radius,
        targetY: (flash.py - cy) / radius,
      });
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
    /** Where the drawn square's corners are (0-1 of the frame): top-left, then clockwise. */
    corners,
    /** How fast the pattern is really being drawn (the screen's refresh rate, unless throttled). */
    stats() {
      const elapsedMs = started === null ? 0 : performance.now() - started;
      return { framesDrawn: frame, drawnFps: elapsedMs > 0 ? (frame * 1000) / elapsedMs : null };
    },
    stop() {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}
