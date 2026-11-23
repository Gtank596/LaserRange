import { checkCameraSupport, describeCameraError } from '../../camera/errors.js';
import { probeMainThreadFeatures, probeWorkerFeatures } from '../../camera/features.js';
import { frameLoopMethod, startFrameLoop } from '../../camera/frameLoop.js';
import { createFrameSampler } from '../../camera/frameSampler.js';
import { createFrameStats, summarize } from '../../camera/frameStats.js';
import { buildConstraints, describeTrack, openCamera, stopStream } from '../../camera/stream.js';
import { createSyntheticSource } from '../../simulation/syntheticSource.js';
import { icons } from '../../ui/icons.js';
import { attachBuildFooter, BUILD_ID, buildFooterHtml } from '../build.js';
import { appState } from '../state.js';

const UI_REFRESH_MS = 250; // telemetry text/graph refresh; frames are still measured individually
const REDNESS_WINDOW = 30; // frames

const fixed = (value, digits = 1) => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '–');

function brightnessWord(meanLuma) {
  if (meanLuma < 25) return 'very dark';
  if (meanLuma < 70) return 'dim';
  if (meanLuma < 190) return 'moderate';
  return 'very bright';
}

export function cameraScreen(root) {
  root.innerHTML = `
    <main class="screen">
      <header class="app-bar"><a class="back-link" href="#/">${icons.back}Home</a></header>
      <h1 class="screen-title">Camera check</h1>
      <p class="lede">Measures how fast frames really arrive on this device. Nothing is recorded or uploaded.</p>

      <p class="banner" id="cam-status" role="status" aria-live="polite"></p>

      <div class="preview">
        <video id="cam-video" playsinline muted autoplay aria-label="Camera preview"></video>
        <div class="preview__placeholder" id="cam-placeholder">${icons.camera}<span>Camera is off</span></div>
        <span class="preview__badge" id="cam-badge" hidden></span>
      </div>

      <div class="controls">
        <div class="field">
          <label for="cam-source">Source</label>
          <select id="cam-source">
            <option value="environment">Rear camera</option>
            <option value="user">Front camera</option>
            <option value="synthetic">Test pattern</option>
          </select>
        </div>
        <div class="field">
          <label for="cam-analysis">Pixel analysis</label>
          <select id="cam-analysis">
            <option value="160">160 px wide</option>
            <option value="0">Off (timing only)</option>
            <option value="320">320 px wide</option>
            <option value="640">640 px wide</option>
          </select>
        </div>
        <div class="field">
          <label for="cam-fps">Requested rate</label>
          <select id="cam-fps">
            <option value="60">60 fps</option>
            <option value="30">30 fps</option>
            <option value="120">120 fps</option>
          </select>
        </div>
        <div class="field">
          <label for="cam-res">Requested size</label>
          <select id="cam-res">
            <option value="1280x720">1280 × 720</option>
            <option value="1920x1080">1920 × 1080</option>
            <option value="640x480">640 × 480</option>
          </select>
        </div>
      </div>

      <button class="btn btn--primary btn--block" id="cam-toggle" type="button"></button>

      <section class="card" aria-labelledby="timing-title">
        <div class="card__head"><h2 class="card__title" id="timing-title">Measured on this device</h2></div>
        <dl class="metrics">
          <div class="metric"><dt>Observed frame rate</dt><dd id="m-fps">–</dd></div>
          <div class="metric"><dt>Browser reports</dt><dd id="m-track">–</dd></div>
          <div class="metric metric--wide"><dt>Frame interval (mean · 95th pct · worst)</dt><dd id="m-interval">–</dd></div>
          <div class="metric"><dt>Frames seen</dt><dd id="m-frames">–</dd></div>
          <div class="metric"><dt>Frames missed</dt><dd id="m-missed">–</dd></div>
          <div class="metric"><dt>Analysis per frame</dt><dd id="m-process">–</dd></div>
          <div class="metric"><dt>Copy in · read · maths</dt><dd id="m-breakdown">–</dd></div>
          <div class="metric"><dt>Brightness (0–255)</dt><dd id="m-luma">–</dd></div>
          <div class="metric"><dt>Peak redness, recent</dt><dd id="m-red">–</dd></div>
        </dl>
      </section>

      <section class="card" aria-labelledby="graph-title">
        <div class="card__head"><h2 class="card__title" id="graph-title">Frame intervals</h2></div>
        <canvas class="graph" id="cam-graph" role="img" aria-label="Bar graph of recent frame intervals. The same numbers are summarised in the table above."></canvas>
        <p class="graph-caption">One bar per frame, most recent on the right. Dashed lines mark 16.7 ms (60 fps) and 33.3 ms (30 fps). Tall bars are late frames.</p>
      </section>

      <section class="card" aria-labelledby="report-title">
        <div class="card__head"><h2 class="card__title" id="report-title">Diagnostics report</h2></div>
        <p class="fine-print">A text summary of this run (settings, capabilities, timings) that you can paste into notes or a chat. It contains no images.</p>
        <button class="btn btn--secondary btn--block" id="cam-copy" type="button" disabled style="margin-top:12px">${icons.copy}<span id="cam-copy-label">Copy report</span></button>
        <details id="cam-report-details">
          <summary class="fine-print" style="margin-top:12px;cursor:pointer">Show report text</summary>
          <pre class="report" id="cam-report" tabindex="0">Run the camera to generate a report.</pre>
        </details>
      </section>

      <details class="card">
        <summary>What these numbers do not prove</summary>
        <ul class="notes">
          <li>Requested rate and size are only hints. The browser may deliver less; trust “Observed”, not “Requested”.</li>
          <li>Frame intervals show when frames reach this page. They do not show how long the sensor was exposing, so they cannot by themselves say whether a very short flash would be captured.</li>
          <li>iOS controls exposure automatically. Lighting may change how reliably brief flashes are caught; that has to be measured with the LED fixture.</li>
          <li>Some browsers round timestamps to whole milliseconds, so small timings are approximate.</li>
          <li>The installed home-screen app can behave differently from a Safari tab. Check both.</li>
          <li>The test pattern exercises the software only. It says nothing about a real camera or a real laser cartridge.</li>
        </ul>
      </details>

      ${buildFooterHtml}
    </main>`;

  attachBuildFooter(root);

  const $ = (selector) => root.querySelector(selector);
  const video = /** @type {HTMLVideoElement} */ ($('#cam-video'));
  const statusEl = $('#cam-status');
  const toggleBtn = $('#cam-toggle');
  const copyBtn = $('#cam-copy');
  const copyLabel = $('#cam-copy-label');
  const reportEl = $('#cam-report');
  const reportDetails = $('#cam-report-details');
  const badge = $('#cam-badge');
  const placeholder = $('#cam-placeholder');
  const graph = /** @type {HTMLCanvasElement} */ ($('#cam-graph'));
  const selects = [$('#cam-source'), $('#cam-analysis'), $('#cam-fps'), $('#cam-res')];

  let disposed = false;
  let starting = false;
  /** @type {null | Record<string, any>} */
  let run = null;
  let copyTimer = 0;

  // Which frame-access APIs exist here (main thread now, worker asynchronously).
  const features = { mainThread: probeMainThreadFeatures(), worker: null };
  probeWorkerFeatures().then((result) => (features.worker = result));

  function setStatus(kind, title, detail = '') {
    const icon = kind === 'ok' ? icons.check : kind === 'error' ? icons.alert : icons.info;
    statusEl.className = `banner${kind === 'ok' ? ' banner--ok' : kind === 'error' ? ' banner--error' : ''}`;
    statusEl.innerHTML = `${icon}<span><strong></strong> <span></span></span>`;
    statusEl.querySelector('strong').textContent = title;
    statusEl.querySelector('span span').textContent = detail;
    // The Start button sits below the preview, so an error could otherwise
    // appear off-screen above it.
    if (kind === 'error') statusEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function renderToggle() {
    const running = Boolean(run);
    toggleBtn.className = `btn btn--block ${running ? 'btn--stop' : 'btn--primary'}`;
    toggleBtn.innerHTML = running ? `${icons.stop}Stop camera` : `${icons.play}${starting ? 'Starting…' : 'Start camera'}`;
    toggleBtn.disabled = starting;
    selects.forEach((select) => (select.disabled = running || starting));
  }

  function cameraSupport() {
    return checkCameraSupport({
      isSecureContext: window.isSecureContext,
      hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
    });
  }

  async function start() {
    if (run || starting) return;
    const source = $('#cam-source').value;
    const analysisWidth = Number($('#cam-analysis').value);
    const frameRate = Number($('#cam-fps').value);
    const [width, height] = $('#cam-res').value.split('x').map(Number);
    const isSynthetic = source === 'synthetic';

    if (!isSynthetic) {
      const support = cameraSupport();
      if (!support.ok) {
        setStatus('error', support.title, support.detail);
        return;
      }
    }

    starting = true;
    renderToggle();
    setStatus('info', 'Starting…', isSynthetic ? '' : 'Your browser may ask for permission to use the camera.');

    let stream = null;
    let synthetic = null;
    const release = () => {
      if (synthetic) synthetic.stop();
      else stopStream(stream);
      video.srcObject = null;
    };

    try {
      if (isSynthetic) {
        synthetic = createSyntheticSource({ fps: frameRate, width, height });
        stream = synthetic.stream;
      } else {
        stream = await openCamera(buildConstraints({ facingMode: source, width, height, frameRate }));
      }
      if (disposed) return release();
      video.srcObject = stream;
      await video.play();
    } catch (error) {
      release();
      starting = false;
      if (disposed) return;
      const problem = describeCameraError(error);
      setStatus('error', problem.title, problem.detail);
      renderToggle();
      return;
    }
    if (disposed) return release();

    const stats = createFrameStats();
    // Analysis "Off" measures frame delivery alone, to separate what the
    // browser does from what our own per-frame work costs.
    const sampler = analysisWidth > 0 ? createFrameSampler({ width: analysisWidth }) : null;
    const recentRedness = [];
    const breakdown = { frames: 0, drawMs: 0, readMs: 0, analyzeMs: 0 };
    const track = stream.getVideoTracks()[0];
    const onEnded = () => stop('ended');
    track?.addEventListener('ended', onEnded);

    run = {
      isSynthetic,
      requested: { source, frameRate, width, height, analysisWidth },
      stats,
      pixels: null,
      recentRedness,
      breakdown,
      uiRefreshMs: [],
      trackInfo: describeTrack(stream, { includeLabel: !isSynthetic }),
      release,
      detach: () => track?.removeEventListener('ended', onEnded),
      stopLoop: startFrameLoop(video, (frame) => {
        if (!sampler) {
          stats.push(frame);
          return;
        }
        const t0 = performance.now();
        const sample = sampler.sample(video);
        const processMs = performance.now() - t0;
        if (sample) {
          run.pixels = sample;
          breakdown.frames += 1;
          breakdown.drawMs += sample.timing.drawMs;
          breakdown.readMs += sample.timing.readMs;
          breakdown.analyzeMs += sample.timing.analyzeMs;
          recentRedness.push(sample.peakRedness);
          if (recentRedness.length > REDNESS_WINDOW) recentRedness.shift();
        }
        stats.push({ ...frame, processMs });
      }),
      timer: window.setInterval(refresh, UI_REFRESH_MS),
    };

    starting = false;
    placeholder.hidden = true;
    badge.hidden = false;
    setStatus(
      'ok',
      isSynthetic ? 'Test pattern running.' : 'Camera running.',
      isSynthetic ? 'Software-only source; not a camera measurement.' : 'Hold the phone still for a few seconds to collect timings.',
    );
    renderToggle();
  }

  /** @param {'user' | 'hidden' | 'ended' | 'unmount'} reason */
  function stop(reason) {
    if (!run) return;
    refresh(); // capture the final numbers before tearing down
    writeReport();
    window.clearInterval(run.timer);
    run.stopLoop();
    run.detach();
    run.release();
    run = null;
    if (reason === 'unmount') return;

    placeholder.hidden = false;
    badge.hidden = true;
    if (reason === 'hidden') {
      setStatus('info', 'Paused while in the background.', 'The camera was released to save battery. Start it again to continue.');
    } else if (reason === 'ended') {
      setStatus('error', 'The camera was stopped by the system.', 'This can happen after a call, a lock, or another app taking the camera. Start it again to continue.');
    } else {
      setStatus('info', 'Camera is off.', 'Results from the last run are kept below.');
    }
    renderToggle();
  }

  function breakdownMeans() {
    const { frames, drawMs, readMs, analyzeMs } = run.breakdown;
    if (!frames) return null;
    return { drawMs: drawMs / frames, readMs: readMs / frames, analyzeMs: analyzeMs / frames };
  }

  /** Updates the on-screen numbers. Kept light: it runs while frames are being measured. */
  function refresh() {
    if (!run) return;
    const started = performance.now();
    const snap = run.stats.snapshot();
    const settings = run.trackInfo?.settings ?? {};
    const interval = snap.callbackIntervalMs;
    const parts = breakdownMeans();
    const analysisOff = run.requested.analysisWidth === 0;

    $('#m-fps').textContent = snap.observedFps ? `${fixed(snap.observedFps)} fps` : 'measuring…';
    $('#m-track').textContent = video.videoWidth
      ? `${video.videoWidth} × ${video.videoHeight}${settings.frameRate ? ` @ ${fixed(settings.frameRate, 0)} fps` : ''}`
      : '–';
    $('#m-interval').textContent = interval
      ? `${fixed(interval.mean)} · ${fixed(interval.p95)} · ${fixed(interval.max)} ms`
      : 'measuring…';
    $('#m-frames').textContent = String(snap.frames);
    $('#m-missed').textContent = snap.missedFrames === null ? 'not reported' : String(snap.missedFrames);
    $('#m-process').textContent = analysisOff
      ? 'off'
      : snap.processMs
        ? `${fixed(snap.processMs.mean, 2)} ms (worst ${fixed(snap.processMs.max, 1)})`
        : '–';
    $('#m-breakdown').textContent = analysisOff
      ? 'off'
      : parts
        ? `${fixed(parts.drawMs, 2)} · ${fixed(parts.readMs, 2)} · ${fixed(parts.analyzeMs, 2)} ms`
        : '–';
    const peakRed = run.recentRedness.length ? Math.max(...run.recentRedness) : null;
    $('#m-luma').textContent = analysisOff
      ? 'off'
      : run.pixels
        ? `${fixed(run.pixels.meanLuma, 0)} · ${brightnessWord(run.pixels.meanLuma)}`
        : '–';
    $('#m-red').textContent = analysisOff ? 'off' : peakRed === null ? '–' : `${fixed(peakRed, 0)} / 255`;
    badge.textContent = snap.observedFps ? `${fixed(snap.observedFps)} fps observed` : 'measuring…';

    drawGraph(snap.recentIntervalsMs);
    copyBtn.disabled = false;

    if (!run.isSynthetic && snap.frames > 0) {
      appState.cameraCheck = {
        source: run.requested.source,
        observedFps: snap.observedFps,
        width: video.videoWidth,
        height: video.videoHeight,
        at: new Date().toISOString(),
      };
    }

    run.uiRefreshMs.push(performance.now() - started);
    if (run.uiRefreshMs.length > 240) run.uiRefreshMs.shift();
  }

  /**
   * Builds the report text. Only called on demand (stop, copy, or opening the
   * report) so that serialising it never competes with frame delivery.
   */
  function writeReport() {
    if (!run) return; // after stopping, the last report stays as it was
    const { recentIntervalsMs, ...timing } = run.stats.snapshot();
    const peakRed = run.recentRedness.length ? Math.max(...run.recentRedness) : null;
    let image = null;
    if (run.pixels) {
      const { timing: _lastFrameTiming, ...pixelStats } = run.pixels;
      image = { ...pixelStats, peakRednessRecent: peakRed };
    }
    const report = {
      app: 'LaserRange',
      report: 'camera-diagnostics',
      reportVersion: 2,
      build: BUILD_ID,
      createdAt: new Date().toISOString(),
      environment: {
        userAgent: navigator.userAgent,
        secureContext: window.isSecureContext,
        installedStandalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
        devicePixelRatio: window.devicePixelRatio,
        frameCallback: frameLoopMethod(),
        features,
      },
      requested: run.requested,
      track: run.trackInfo,
      video: { width: video.videoWidth, height: video.videoHeight },
      timing: {
        ...timing,
        analysisBreakdownMs: breakdownMeans(),
        uiRefreshMs: summarize(run.uiRefreshMs),
      },
      image,
      recentIntervalsMs,
    };
    reportEl.textContent = JSON.stringify(report, (_, value) => (typeof value === 'number' ? Math.round(value * 100) / 100 : value), 2);
  }

  function drawGraph(intervals) {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = graph.clientWidth;
    const cssHeight = graph.clientHeight;
    if (!cssWidth || !cssHeight) return;
    if (graph.width !== Math.round(cssWidth * dpr) || graph.height !== Math.round(cssHeight * dpr)) {
      graph.width = Math.round(cssWidth * dpr);
      graph.height = Math.round(cssHeight * dpr);
    }
    const ctx = graph.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const top = Math.min(200, Math.max(50, ...intervals) * 1.1);
    const y = (ms) => cssHeight - (Math.min(ms, top) / top) * (cssHeight - 6);

    ctx.font = '10px sans-serif';
    ctx.setLineDash([4, 4]);
    for (const guide of [16.7, 33.3]) {
      ctx.strokeStyle = 'rgba(181, 201, 210, 0.45)';
      ctx.beginPath();
      ctx.moveTo(0, y(guide));
      ctx.lineTo(cssWidth, y(guide));
      ctx.stroke();
      ctx.fillStyle = '#b5c9d2';
      ctx.fillText(`${guide} ms`, 4, y(guide) - 3);
    }
    ctx.setLineDash([]);

    const slots = 240;
    const barWidth = cssWidth / slots;
    const sorted = [...intervals].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    intervals.forEach((ms, i) => {
      const x = cssWidth - (intervals.length - i) * barWidth;
      ctx.fillStyle = ms > median * 1.5 ? '#f3a65e' : '#63d4af';
      ctx.fillRect(x, y(ms), Math.max(1, barWidth - 0.5), cssHeight - y(ms));
    });
  }

  async function copyReport() {
    writeReport();
    let message = 'Copied';
    try {
      await navigator.clipboard.writeText(reportEl.textContent);
    } catch {
      // Clipboard can be blocked (permissions, insecure context): show the text instead.
      reportDetails.open = true;
      const range = document.createRange();
      range.selectNodeContents(reportEl);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      message = 'Copy blocked: text selected below';
    }
    copyLabel.textContent = message;
    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => (copyLabel.textContent = 'Copy report'), 2500);
  }

  const onVisibility = () => {
    if (document.hidden) stop('hidden');
  };

  toggleBtn.addEventListener('click', () => (run ? stop('user') : start()));
  copyBtn.addEventListener('click', copyReport);
  reportDetails.addEventListener('toggle', () => {
    if (reportDetails.open) writeReport();
  });
  document.addEventListener('visibilitychange', onVisibility);

  const support = cameraSupport();
  if (support.ok) {
    setStatus('info', 'Camera is off.', 'Choose a source and press Start camera.');
  } else {
    setStatus('error', support.title, `${support.detail} The test pattern source still works.`);
  }
  renderToggle();

  return () => {
    disposed = true;
    stop('unmount');
    window.clearTimeout(copyTimer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
