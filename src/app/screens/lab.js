import { buildRoiMask, createMapper } from '../../calibration/calibration.js';
import { scoreHit } from '../../calibration/scoring.js';
import { calibrationFits } from '../../calibration/store.js';
import { checkCameraSupport, describeCameraError } from '../../camera/errors.js';
import { startFrameLoop } from '../../camera/frameLoop.js';
import { createFrameGrabber } from '../../camera/frameSampler.js';
import { createFrameStats, summarize } from '../../camera/frameStats.js';
import { buildConstraints, openCamera, stopStream } from '../../camera/stream.js';
import { matchEvents } from '../../detection/matchEvents.js';
import { confidenceWord } from '../../detection/params.js';
import { createFlashPipeline } from '../../detection/pipeline.js';
import { createSyntheticSource } from '../../simulation/syntheticSource.js';
import { icons } from '../../ui/icons.js';
import { attachBuildFooter, BUILD_ID, buildFooterHtml } from '../build.js';
import { appState } from '../state.js';

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
  motion: 'Movement in view',
  large: 'Lit area too big for a dot',
};

const REJECTION_TEXT = {
  cooldown: 'too soon after the previous hit',
  persistent: 'stayed lit too long to be a flash',
  motion: 'something else moved or the light changed',
  large: 'the lit area grew too big to be a dot',
};

// Stretches of frames the detector refused to trust, by cause.
const IGNORED_TEXT = {
  large: 'lit area too big to be a dot',
  motion: 'movement in view',
  unstable: 'too much of the picture changed',
};

// "Large" is for a bare LED, which lights up its surroundings as well as itself.
const DOT_LIMITS = {
  normal: { maxAreaFraction: 0.01, maxCandidateFraction: 0.03 },
  large: { maxAreaFraction: 0.05, maxCandidateFraction: 0.1 },
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
            <option value="environment">Rear camera</option>
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
            <option value="16">17 ms (1 video frame)</option>
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
        <div class="field">
          <label for="lab-dot">Dot size limit</label>
          <select id="lab-dot">
            <option value="normal">Normal (1% of view)</option>
            <option value="large">Large (5% of view)</option>
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
          <div class="metric metric--wide"><dt>Ignored (video not trusted)</dt><dd id="r-ignored">–</dd></div>
          <div class="metric metric--wide"><dt>Video delivery</dt><dd id="r-delivery">–</dd></div>
          <div class="metric metric--wide"><dt>Calibration</dt><dd id="r-calibration">–</dd></div>
          <div class="metric metric--wide"><dt>Ring scores vs. expected (test pattern)</dt><dd id="r-scores">–</dd></div>
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
          <li>The shortest test flash is one video frame (about 17 ms). On a 120 Hz screen anything shorter is drawn and gone between two video frames, so it would never reach detection at all.</li>
          <li>“Rejected” counts things seen but not reported as hits: a second flash too soon after the first, something red that stayed in view, or a spot seen while other things were moving or the light was changing.</li>
          <li>“Ignored” counts stretches of video the detector did not trust at all: something lit up more of the view than a dot would, something was moving, or the whole picture changed.</li>
          <li>Dot size limit “Large” is for testing with a bare LED, which lights up whatever is around it. A laser dot on paper has not been measured yet, so the normal limit is still a guess.</li>
          <li>The camera source has no ground truth, so only detected hits are counted. Compare the count with the number of flashes your test light sent.</li>
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
  const selects = [$('#lab-source'), $('#lab-sensitivity'), $('#lab-flash'), $('#lab-intensity'), $('#lab-dot')];

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
    const dotLimit = $('#lab-dot').value;

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

    // Use the saved calibration only if it was made with this source and picture size.
    const calibration = calibrationFits(appState.calibration, source, video) ? appState.calibration : null;
    const mapper = calibration ? createMapper(calibration) : null;

    const grabber = createFrameGrabber({ width: WORKING_WIDTH });
    const track = stream.getVideoTracks()[0];
    const onEnded = () => stop('ended');
    track?.addEventListener('ended', onEnded);
    let pipeline = null;

    logEl.innerHTML = '<li class="log__empty">Nothing yet.</li>';
    run = {
      isSynthetic,
      settings: { source, redDelta, dotLimit, flashMs: isSynthetic ? flashMs : null, flashIntensity: isSynthetic ? flashIntensity : null },
      t0: null, // time of the first analysed frame; event times in the report count from here
      emitted,
      calibration: mapper ? calibration : null,
      mapper,
      detected: [],
      rejected: 0,
      rejectedBy: { cooldown: 0, persistent: 0, motion: 0, large: 0 },
      rejections: [],
      ignored: [],
      ignoredBy: { large: 0, motion: 0, unstable: 0 },
      episode: null,
      frames: 0,
      scene: 'warming',
      sceneCounts: {},
      motionPct: [],
      costMs: [],
      delivery: createFrameStats(),
      patternStats: () => synthetic?.stats() ?? null,
      working: null,
      release,
      detach: () => track?.removeEventListener('ended', onEnded),
      stopLoop: startFrameLoop(video, (frame) => {
        run.delivery.push(frame);
        const t0 = performance.now();
        const image = grabber.grab(video);
        if (!image) return;
        if (!pipeline || pipeline.width !== image.width || pipeline.height !== image.height) {
          // With a calibration, only the target area is watched.
          const mask = mapper ? buildRoiMask(calibration.corners, image.width, image.height) : null;
          pipeline = createFlashPipeline(image.width, image.height, { redDelta, ...DOT_LIMITS[dotLimit] }, { mask });
          run.working = { width: image.width, height: image.height };
        }
        const result = pipeline.process(image.data, frame.now);
        if (run.t0 === null) run.t0 = frame.now;
        trackIgnored(result, frame.now);
        run.frames += 1;
        run.scene = result.status;
        run.sceneCounts[result.status] = (run.sceneCounts[result.status] ?? 0) + 1;
        run.motionPct.push(result.motionFraction * 100);
        if (run.motionPct.length > 600) run.motionPct.shift();
        run.costMs.push(performance.now() - t0);
        if (run.costMs.length > 240) run.costMs.shift();
        if (result.event) onEvent(result.event);
      }),
      timer: window.setInterval(refresh, UI_REFRESH_MS),
    };

    starting = false;
    placeholder.hidden = true;
    $('#lab-tag').textContent = isSynthetic ? 'Simulated' : 'Camera · unverified';
    setStatus(
      'ok',
      isSynthetic ? 'Test pattern running.' : 'Camera running.',
      isSynthetic ? 'A red dot flashes about once a second. Software check only.' : 'Prop the phone so it cannot move. Camera detection is still being measured.',
    );
    renderToggle();
  }

  /**
   * Groups consecutive untrusted frames into one "ignored" entry, so a flash
   * that was thrown away for being too big shows up as one line, not six.
   */
  function trackIgnored(result, now) {
    const status = result.status;
    const disturbed = status === 'large' || status === 'motion' || status === 'unstable' || status === 'adapting';
    if (disturbed) {
      if (!run.episode) run.episode = { t: now, frames: 0, kinds: {}, largest: null };
      const episode = run.episode;
      episode.frames += 1;
      episode.kinds[status] = (episode.kinds[status] ?? 0) + 1;
      if (result.largest && (!episode.largest || result.largest.fraction > episode.largest.fraction)) episode.largest = result.largest;
      return;
    }
    const episode = run.episode;
    if (!episode) return;
    run.episode = null;
    // 'adapting' only ever follows something else; name the stretch by its cause.
    const kind = episode.kinds.large ? 'large' : episode.kinds.unstable ? 'unstable' : episode.kinds.motion ? 'motion' : null;
    if (!kind) return;
    run.ignoredBy[kind] += 1;
    run.ignored.push({ t: episode.t, frames: episode.frames, kind, largest: episode.largest });
    if (run.ignored.length > 200) run.ignored.shift();
    const size = kind === 'large' && episode.largest ? ` (${fixed(episode.largest.fraction * 100)}% of the view)` : '';
    addLog(`Ignored · ${IGNORED_TEXT[kind]}${size} · ${episode.frames} frame${episode.frames === 1 ? '' : 's'}`);
    if (kind === 'large' && run.ignoredBy.large === 1) {
      setStatus(
        'info',
        'Something red lit up more of the view than a dot would.',
        'It was not counted as a hit. Cover the light so only a small spot shows, or set Dot size limit to Large.',
      );
    }
  }

  function onEvent(event) {
    if (event.accepted) {
      let ring = '';
      if (run.mapper) {
        event.target = run.mapper.imageToTarget(event.x, event.y);
        event.score = scoreHit(event.target, run.mapper.target);
        ring = `${event.score > 0 ? `ring ${event.score}` : 'outside the rings'} · `;
      }
      run.detected.push(event);
      addLog(
        `#${event.index} · ${ring}x ${pct(event.x)} y ${pct(event.y)} · ${event.frames} frame${event.frames === 1 ? '' : 's'} · ${fixed(event.durationMs, 0)} ms · ${confidenceWord(event.confidence)}`,
      );
      drawOverlay(); // show the hit straight away rather than on the next refresh
    } else {
      run.rejected += 1;
      run.rejectedBy[event.reason] = (run.rejectedBy[event.reason] ?? 0) + 1;
      run.rejections.push(event);
      if (run.rejections.length > 200) run.rejections.shift();
      addLog(`Rejected · ${REJECTION_TEXT[event.reason] ?? event.reason}`);
    }
  }

  function summarise() {
    const cost = summarize(run.costMs);
    // A wide time window: on a slow or throttled display a frame can reach the
    // detector a second or more after it was drawn. Position keeps matches honest.
    const match = run.isSynthetic
      ? matchEvents(run.emitted, run.detected, { now: performance.now(), maxDelayMs: MATCH_WINDOW_MS })
      : null;
    const { recentIntervalsMs: _intervals, ...delivery } = run.delivery.snapshot();

    // On the calibrated test pattern the true target position of every flash is
    // known, so the whole chain (detect, map through the calibration, score)
    // can be checked against it.
    let scoreCheck = null;
    if (match && run.mapper) {
      let agree = 0;
      let errorSum = 0;
      for (const { flash, hit } of match.pairs) {
        if (scoreHit({ x: flash.targetX, y: flash.targetY }, run.mapper.target) === hit.score) agree += 1;
        errorSum += Math.hypot(hit.target.x - flash.targetX, hit.target.y - flash.targetY);
      }
      const compared = match.pairs.length;
      scoreCheck = {
        compared,
        scoresAgree: agree,
        // Mean distance between mapped and true position, as a percentage of the outer ring radius.
        meanTargetErrorPct: compared ? (errorSum / compared) * 100 : null,
      };
    }
    let groundTruth = null;
    if (match) {
      const { pairs: _pairs, ...counts } = match;
      groundTruth = counts;
    }
    return {
      app: 'LaserRange',
      report: 'detection-lab',
      reportVersion: 5,
      build: BUILD_ID,
      createdAt: new Date().toISOString(),
      settings: run.settings,
      calibration: run.calibration ? { inUse: true, savedAt: run.calibration.savedAt, corners: run.calibration.corners } : { inUse: false },
      scoreCheck,
      video: { width: video.videoWidth, height: video.videoHeight },
      working: run.working,
      // Frames by scene state, and how much of the frame changed between
      // consecutive frames (percent, last 600 frames): for tuning movement rejection.
      sceneFrames: run.sceneCounts,
      frameChangePct: summarize(run.motionPct),
      rejectedBy: run.rejectedBy,
      ignoredBy: run.ignoredBy,
      // How frames reached the detector: needed to tell "detector missed it"
      // apart from "the frame never arrived".
      delivery,
      testPattern: run.patternStats(),
      frames: run.frames,
      detected: run.detected.length,
      rejected: run.rejected,
      groundTruth,
      costMs: cost,
      // tMs everywhere below: milliseconds since the first analysed frame.
      hits: run.detected.slice(-60).map((hit) => ({
        index: hit.index,
        tMs: hit.t - run.t0,
        x: hit.x,
        y: hit.y,
        ...(hit.target ? { targetX: hit.target.x, targetY: hit.target.y, score: hit.score } : {}),
        frames: hit.frames,
        durationMs: hit.durationMs,
        peak: hit.peak,
        area: hit.area,
        strayPct: hit.stray * 100,
        confidence: hit.confidence,
      })),
      rejections: run.rejections.slice(-60).map((event) => ({
        tMs: event.t - run.t0,
        reason: event.reason,
        x: event.x,
        y: event.y,
        frames: event.frames,
        durationMs: event.durationMs,
        peak: event.peak,
        area: event.area,
        strayPct: event.stray * 100,
      })),
      ignored: run.ignored.slice(-60).map((episode) => ({
        tMs: episode.t - run.t0,
        kind: episode.kind,
        frames: episode.frames,
        ...(episode.largest ? { largestPct: episode.largest.fraction * 100, x: episode.largest.x, y: episode.largest.y } : {}),
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
    const ignoredParts = Object.entries(summary.ignoredBy)
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => `${count} × ${IGNORED_TEXT[kind]}`);
    $('#r-ignored').textContent = ignoredParts.length ? ignoredParts.join(' · ') : 'nothing';
    const { observedFps, missedFrames } = summary.delivery;
    const drawn = summary.testPattern?.drawnFps;
    $('#r-delivery').textContent = observedFps
      ? `${fixed(observedFps)} fps · ${missedFrames === null ? 'missed frames not reported' : `${missedFrames} missed`}${drawn ? ` · pattern drawn at ${fixed(drawn, 0)} fps` : ''}`
      : 'measuring…';
    $('#r-last').textContent = last
      ? `#${last.index}${last.score !== undefined ? (last.score > 0 ? ` · ring ${last.score}` : ' · outside the rings') : ''} at x ${pct(last.x)}, y ${pct(last.y)} · ${confidenceWord(last.confidence)} signal`
      : 'none yet';
    $('#r-calibration').textContent = run.calibration
      ? 'In use: only the target area is watched, and hits get ring scores'
      : appState.calibration
        ? 'Saved one was made for a different source or picture size: not used'
        : 'None: the whole picture is watched, no ring scores';
    const check = summary.scoreCheck;
    $('#r-scores').textContent = check
      ? check.compared
        ? `${check.scoresAgree} of ${check.compared} agree · position off by ${fixed(check.meanTargetErrorPct, 2)}% of ring radius`
        : 'waiting for hits'
      : 'needs the test pattern with a saved calibration';
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

    // The calibrated target area, when one is in use.
    if (run.calibration) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(99, 212, 175, 0.8)';
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      run.calibration.corners.forEach((corner, i) =>
        i === 0 ? ctx.moveTo(corner.x * w, corner.y * h) : ctx.lineTo(corner.x * w, corner.y * h),
      );
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }

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
