// A synthetic video source: a canvas drawn every animation frame and exposed as
// a MediaStream. It exercises the same frame loop and telemetry as the camera
// without needing a camera, permission, or HTTPS.
//
// It is a software test pattern only. A display-rate canvas says nothing about
// how a real camera sensor captures a short laser flash.

/**
 * @param {{ width?: number, height?: number, fps?: number, flashEveryMs?: number, flashMs?: number }} [options]
 * @returns {{ stream: MediaStream, stop: () => void }}
 */
export function createSyntheticSource({ width = 640, height = 480, fps = 30, flashEveryMs = 1000, flashMs = 50 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const started = performance.now();
  let raf = 0;
  let frame = 0;

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.4;

  const draw = (now) => {
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

    // A red dot that appears briefly at a position that changes each flash.
    const cycle = Math.floor(t / flashEveryMs);
    if (t % flashEveryMs < flashMs) {
      const angle = cycle * 2.4;
      const dist = radius * (0.15 + 0.6 * ((cycle * 0.37) % 1));
      ctx.fillStyle = '#ff2a1a';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, 7, 0, Math.PI * 2);
      ctx.fill();
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
