import { checkCameraSupport, describeCameraError } from '../../camera/errors.js';
import { startFrameLoop } from '../../camera/frameLoop.js';
import { createFrameGrabber } from '../../camera/frameSampler.js';
import { summarize } from '../../camera/frameStats.js';
import { buildConstraints, openCamera, stopStream } from '../../camera/stream.js';
import { matchEvents } from '../../detection/matchEvents.js';
import { confidenceWord } from '../../detection/params.js';
import { createFlashPipeline } from '../../detection/pipeline.js';
import { createSyntheticSource } from '../../simulation/syntheticSource.js';
import { icons } from '../../ui/icons.js';
import { attachBuildFooter, BUILD_ID, buildFooterHtml } from '../build.js';

const UI_REFRESH_MS = 250;
const WORKING_WIDTH = 320; // detection runs on a downscaled copy this many pixels wide
const FLASH_EVERY_MS = 1200;
const MATCH_WINDOW_MS = 2500;
const LOG_LINES = 12;
const MARKERS = 8;

const pct = (value) => `${(value * 100).toFixed(0)}%`;
const fixed = (value, digits = 1) => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '–');

const SCENE_TEXT = {
  ok: 'Steady',
  warming: 'Starting',
  unstable: 'Too much change',
  adapting: 'Settling',
};

export function labScreen(root) {
  root.innerHTML = `
    <main class="screen">
      <header class="app-bar"><a class="back-link" href="#/">${icons.back}Home</a></header>
      <h1 class="screen-title">Detection lab</h1>
      <p class="lede">Looks for brief red flashes in the video and reports each one once. On the test pattern it also checks itself against the flashes it drew.</p>

      <p class="banner" id="lab-status" role="status" aria-live="polite"></p>

      <div class="preview preview--fit" id="lab-preview">
        <video id="lab-video" playsinline muted autoplay aria-label="Video being analysed"></video>
        <canvas class="preview__overlay" id="lab-overlay" aria-hidden="true"></canvas>
        <div class="preview__placeholder" id="lab-placeholder">${icons.pulse}<span>Not running</span></div>
      </div>
      <ul class="legend" aria-label="Marker legend">
        <li><svg viewBox="-9 -9 18 18" aria-hidden="true"><circle r="6" fill="none" stroke="#f3a65e" stroke-width="2.5"/></svg>Detected hit</li>
        <li><svg viewBox="-9 -9 18 18" aria-hidden="true"><path d="M-6 0H6M0 -6V6" stroke="#63d4af" stroke-width="2"/></svg>Flash drawn (test pattern)</li>
      </ul>

      <div class="controls">
        <div class="field">
          <label for="lab-source">Source</label>
          <select id="lab-source">
            <option value="synthetic">Test pattern</option>
            <option value="environment">Rear camera (untested)</option>
          </select>
        </div>
        <div class="field">
          <label for="lab-sensitivity">Sensitivity</label>
          <select id="lab-sensitivity">
            <option value="60">Normal</option>
            <option value="35">High</option>
            <option value="90">Low</option>
          </select>
        </div>
        <div class="field">
          <label for="lab-flash">Test flash length</label>
          <select id="lab-flash">
            <option value="1">1 screen frame</option>
            <option value="33">33 ms</option>
            <option value="50">50 ms</option>
            <option value="100">100 ms</option>
          </select>
        </div>
        <div class="field">
          <label for="lab-intensity">Test flash strength</label>
          <select id="lab-intensity">
            <option value="1">100%</option>
            <option value="0.5">50%</option>
            <option value="0.3">30%</option>
            <option value="0.15">15%</option>
          </select>
        </div>
      </div>

      <button class="btn btn--primary btn--block" id="lab-toggle" type="button"></button>

      <section class="card" aria-labelledby="lab-results-title">
        <div class="card__head">
          <h2 class="card__title" id="lab-results-title">Results</h2>
          <span class="tag" id="lab-tag">Simulated</span>
        </div>
        <dl class="metrics">
          <div class="metric"><dt>Flashes drawn</dt><dd id="r-emitted">–</dd></div>
          <div class="metric"><dt>Hits detected</dt><dd id="r-detected">–</dd></div>
          <div class="metric"><dt>Matched</dt><dd id="r-matched">–</dd></div>
          <div class="metric"><dt>Missed</dt><dd id="r-missed">–</dd></div>
          <div class="metric"><dt>Extra (no flash there)</dt><dd id="r-extra">–</dd></div>
          <div class="metric"><dt>Rejected</dt><dd id="r-rejected">–</dd></div>
          <div class="metric"><dt>Position error (mean)</dt><dd id="r-error">–</dd></div>
          <div class="metric"><dt>Cost per frame</dt><dd id="r-cost">–</dd></div>
          <div class="metric"><dt>Scene</dt><dd id="r-scene">–</dd></div>
          <div class="metric"><dt>Frames analysed</dt><dd id="r-frames">–</dd></div>
          <div class="metric metric--wide"><dt>Last hit</dt><dd id="r-last">–</dd></div>
        </dl>
      </section>

      <section class="card" aria-labelledby="lab-log-title">
        <div class="card__head"><h2 class="card__title" id="lab-log-title">Event log</h2></div>
        <ol class="log" id="lab-log"><li class="log__empty">Nothing yet.</li></ol>
        <button class="btn btn--secondary btn--block" id="lab-copy" type="button" disabled style="margin-top:12px">${icons.copy}<span id="lab-copy-label">Copy results</span></button>
      </section>

      <details class="card">
        <summary>What this does and does not show</summary>
        <ul class="notes">
          <li>The test pattern is drawn by this app at the screen's refresh rate. Passing it shows the detection logic works; it says nothing about a real camera sensor or a real laser.</li>
          <li>“Rejected” counts things seen but not reported as hits: a second flash too soon after the first, or something red that stayed in view.</li>
          <li>The camera source has no ground truth, so only detected hits are counted. Its settings are untuned guesses until measured with the LED fixture.</li>
          <li>Hit strength (weak / fair / strong) is a rough signal level, not a probability.</li>
          <li>Nothing here checks or implies that a firearm is safe.</li>
        </ul>
      </details>

      ${buildFooterHtml}
    </main>`;

  attachBuildFooter(root);

  const $ = (selector) => root.querySelector(selector);
  const video = /** @type {HTMLVideoElement} */ ($('#lab-video'));
  const overlay = /** @type {HTMLCanvasElement} */ ($('#lab-overlay'));
  const preview = $('#lab-preview');
  const placeholder = $('#lab-placeholder');
  const statusEl = $('#lab-status');
  const toggleBtn = $('#lab-toggle');
  const copyBtn = $('#lab-copy');
  const copyLabel = $('#lab-copy-label');
  const logEl = $('#lab-log');
  const selects = [$('#lab-source'), $('#lab-sensitivity'), $('#lab-flash'), $('#lab-intensity')];

  let disposed = false;
  let starting = false;
  /** @type {null | Record<string, any>} */
  let run = null;
  let lastSummary = null;
  let copyTimer = 0;

  function setStatus(kind, title, detail = '') {
    const icon = kind === 'ok' ? icons.check : kind === 'error' ? icons.alert : icons.info;
    statusEl.className = `banner${kind === 'ok' ? ' banner--ok' : kind === 'error' ? ' banner--error' : ''}`;
    statusEl.innerHTML = `${icon}<span><strong></strong> <span></span></span>`;
    statusEl.querySelector('strong').textContent = title;
    statusEl.querySelector('span span').textContent = detail;
    if (kind === 'error') statusEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function renderToggle() {
    const running = Boolean(run);
    toggleBtn.className = `btn btn--block ${running ? 'btn--stop' : 'btn--primary'}`;
    toggleBtn.innerHTML = running ? `${icons.stop}Stop` : `${icons.play}${starting ? 'Starting…' : 'Start detection'}`;
    toggleBtn.disabled = starting;
    selects.forEach((select) => (select.disabled = running || starting));
  }

  function addLog(text) {
    logEl.querySelector('.log__empty')?.remove();
    const item = document.createElement('li');
    item.textContent = text;
    logEl.prepend(item);
    while (logEl.children.length > LOG_LINES) logEl.lastElementChild.remove();
  }

  async function start() {
    if (run || starting) return;
    const source = $('#lab-source').value;
    const isSynthetic = source === 'synthetic';
    const redDelta = Number($('#lab-sensitivity').value);
    const flashMs = Number($('#lab-flash').value);
    const flashIntensity = Number($('#lab-intensity').value);

    if (!isSynthetic) {
      const support = checkCameraSupport({
        isSecureContext: window.isSecureContext,
        hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
      });
      if (!support.ok) {
        setStatus('error', support.title, support.detail);
        return;
      }
    }

    starting = true;
    renderToggle();
    setStatus('info', 'Starting…', isSynthetic ? '' : 'Your browser may ask for permission to use the camera.');

    const emitted = [];
    let stream = null;
    let synthetic = null;
    const release = () => {
      if (synthetic) synthetic.stop();
      else stopStream(stream);
      video.srcObject = null;
    };

    try {
      if (isSynthetic) {
        synthetic = createSyntheticSource({
          fps: 60,
          width: 1280,
          height: 720,
          flashEveryMs: FLASH_EVERY_MS,
          flashMs,
          flashIntensity,
          onFlash: (flash) => emitted.push(flash),
        });
        stream = synthetic.stream;
      } else {
        stream = await openCamera(buildConstraints({ facingMode: 'environment', width: 1280, height: 720, frameRate: 60 }));
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

    // Shape the preview box like the video so overlay positions line up exactly.
    preview.style.setProperty('--ar', String(video.videoWidth / video.videoHeight || 4 / 3));

    const grabber = createFrameGrabber({ width: WORKING_WIDTH });
    const track = stream.getVideoTracks()[0];
    const onEnded = () => stop('ended');
    track?.addEventListener('ended', onEnded);
    let pipeline = null;

    logEl.innerHTML = '<li class="log__empty">Nothing yet.</li>';
    run = {
      isSynthetic,
      settings: { source, redDelta, flashMs: isSynthetic ? flashMs : null, flashIntensity: isSynthetic ? flashIntensity : null },
      emitted,
      detected: [],
      rejected: 0,
      frames: 0,
      scene: 'warming',
      costMs: [],
      working: null,
      release,
      detach: () => track?.removeEventListener('ended', onEnded),
      stopLoop: startFrameLoop(video, (frame) => {
        const t0 = performance.now();
        const image = grabber.grab(video);
        if (!image) return;
        if (!pipeline || pipeline.width !== image.width || pipeline.height !== image.height) {
          pipeline = createFlashPipeline(image.width, image.height, { redDelta });
          run.working = { width: image.width, height: image.height };
        }
        const result = pipeline.process(image.data, frame.now);
        run.frames += 1;
        run.scene = result.status;
        run.costMs.push(performance.now() - t0);
        if (run.costMs.length > 240) run.costMs.shift();
        if (result.event) onEvent(result.event);
      }),
      timer: window.setInterval(refresh, UI_REFRESH_MS),
    };

    starting = false;
    placeholder.hidden = true;
    $('#lab-tag').textContent = isSynthetic ? 'Simulated' : 'Camera · untested';
    setStatus(
      'ok',
      isSynthetic ? 'Test pattern running.' : 'Camera running.',
      isSynthetic ? 'A red dot flashes about once a second. Software check only.' : 'Hold the phone still. Detection on the camera has not been measured yet.',
    );
    renderToggle();
  }

  function onEvent(event) {
    if (event.accepted) {
      run.detected.push(event);
      addLog(
        `#${event.index} · x ${pct(event.x)} y ${pct(event.y)} · ${event.frames} frame${event.frames === 1 ? '' : 's'} · ${fixed(event.durationMs, 0)} ms · ${confidenceWord(event.confidence)}`,
      );
      drawOverlay(); // show the hit straight away rather than on the next refresh
    } else {
      run.rejected += 1;
      addLog(event.reason === 'persistent' ? 'Rejected · stayed lit too long to be a flash' : 'Rejected · too soon after the previous hit');
    }
  }

  function summarise() {
    const cost = summarize(run.costMs);
    // A wide time window: on a slow or throttled display a frame can reach the
    // detector a second or more after it was drawn. Position keeps matches honest.
    const match = run.isSynthetic
      ? matchEvents(run.emitted, run.detected, { now: performance.now(), maxDelayMs: MATCH_WINDOW_MS })
      : null;
    return {
      app: 'LaserRange',
      report: 'detection-lab',
      reportVersion: 1,
      build: BUILD_ID,
      createdAt: new Date().toISOString(),
      settings: run.settings,
      video: { width: video.videoWidth, height: video.videoHeight },
      working: run.working,
      frames: run.frames,
      detected: run.detected.length,
      rejected: run.rejected,
      groundTruth: match,
      costMs: cost,
      hits: run.detected.slice(-50).map((hit) => ({
        index: hit.index,
        x: hit.x,
        y: hit.y,
        frames: hit.frames,
        durationMs: hit.durationMs,
        peak: hit.peak,
        area: hit.area,
        confidence: hit.confidence,
      })),
    };
  }

  function refresh() {
    if (!run) return;
    const summary = summarise();
    lastSummary = summary;
    const match = summary.groundTruth;
    const last = run.detected[run.detected.length - 1];

    $('#r-emitted').textContent = match ? String(match.emitted) : 'not known';
    $('#r-detected').textContent = String(summary.detected);
    $('#r-matched').textContent = match ? String(match.matched) : '–';
    $('#r-missed').textContent = match ? String(match.missed) : '–';
    $('#r-extra').textContent = match ? String(match.extra) : '–';
    $('#r-rejected').textContent = String(summary.rejected);
    $('#r-error').textContent = match && match.meanError !== null ? `${fixed(match.meanError * 100, 2)}% of frame` : '–';
    $('#r-cost').textContent = summary.costMs ? `${fixed(summary.costMs.mean, 2)} ms (worst ${fixed(summary.costMs.max, 1)})` : '–';
    $('#r-scene').textContent = SCENE_TEXT[run.scene] ?? run.scene;
    $('#r-frames').textContent = String(summary.frames);
    $('#r-last').textContent = last
      ? `#${last.index} at x ${pct(last.x)}, y ${pct(last.y)} · ${confidenceWord(last.confidence)} signal`
      : 'none yet';
    copyBtn.disabled = false;
    drawOverlay();
  }

  function drawOverlay() {
    const dpr = window.devicePixelRatio || 1;
    const w = overlay.clientWidth;
    const h = overlay.clientHeight;
    if (!w || !h) return;
    if (overlay.width !== Math.round(w * dpr) || overlay.height !== Math.round(h * dpr)) {
      overlay.width = Math.round(w * dpr);
      overlay.height = Math.round(h * dpr);
    }
    const ctx = overlay.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!run) return;

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#63d4af';
    for (const flash of run.emitted.slice(-MARKERS)) {
      const x = flash.x * w;
      const y = flash.y * h;
      ctx.beginPath();
      ctx.moveTo(x - 7, y);
      ctx.lineTo(x + 7, y);
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x, y + 7);
      ctx.stroke();
    }

    const hits = run.detected.slice(-MARKERS);
    hits.forEach((hit, i) => {
      const newest = i === hits.length - 1;
      ctx.strokeStyle = '#f3a65e';
      ctx.lineWidth = newest ? 3.5 : 2;
      ctx.beginPath();
      ctx.arc(hit.x * w, hit.y * h, newest ? 13 : 10, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  /** @param {'user' | 'hidden' | 'ended' | 'unmount'} reason */
  function stop(reason) {
    if (!run) return;
    refresh();
    window.clearInterval(run.timer);
    run.stopLoop();
    run.detach();
    run.release();
    run = null;
    if (reason === 'unmount') return;

    placeholder.hidden = false;
    if (reason === 'hidden') {
      setStatus('info', 'Paused while in the background.', 'Start again to continue.');
    } else if (reason === 'ended') {
      setStatus('error', 'The camera was stopped by the system.', 'Start again to continue.');
    } else {
      setStatus('info', 'Stopped.', 'Results from the last run are kept below.');
    }
    renderToggle();
  }

  async function copyResults() {
    if (run) refresh();
    const text = JSON.stringify(lastSummary, (_, value) => (typeof value === 'number' ? Math.round(value * 1000) / 1000 : value), 2);
    let message = 'Copied';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      message = 'Copy was blocked';
    }
    copyLabel.textContent = message;
    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => (copyLabel.textContent = 'Copy results'), 2500);
  }

  const onVisibility = () => {
    if (document.hidden) stop('hidden');
  };

  toggleBtn.addEventListener('click', () => (run ? stop('user') : start()));
  copyBtn.addEventListener('click', copyResults);
  document.addEventListener('visibilitychange', onVisibility);

  setStatus('info', 'Not running.', 'Choose a source and press Start detection.');
  renderToggle();

  return () => {
    disposed = true;
    stop('unmount');
    window.clearTimeout(copyTimer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
