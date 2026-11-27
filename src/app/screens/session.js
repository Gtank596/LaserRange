import { buildRoiMask, createMapper } from '../../calibration/calibration.js';
import { scoreHit } from '../../calibration/scoring.js';
import { loadPrintScale } from '../../calibration/printScale.js';
import { calibrationFits } from '../../calibration/store.js';
import { startFrameLoop } from '../../camera/frameLoop.js';
import { createFrameGrabber } from '../../camera/frameSampler.js';
import { startVideoSession } from '../../camera/videoSession.js';
import { confidenceWord, DOT_LIMITS } from '../../detection/params.js';
import { createFlashPipeline } from '../../detection/pipeline.js';
import { createSessionClock } from '../../sessions/clock.js';
import { newSessionId, summarizeSession } from '../../sessions/metrics.js';
import { getSessionStore } from '../../sessions/store.js';
import { icons } from '../../ui/icons.js';
import { formatClock, sessionSummaryHtml, targetPoints } from '../../ui/sessionView.js';
import { targetLegendHtml, targetOverlaySvg } from '../../ui/targetOverlay.js';
import { BUILD_ID } from '../build.js';
import { appState } from '../state.js';
import { keepAwake } from '../wakeLock.js';

// A live session: watch the video, count each flash once, place it on the
// target when a calibration is in use, and save the result on this device when
// the session ends.

const WORKING_WIDTH = 320;
const UI_REFRESH_MS = 250;
const PREVIEW_MARKERS = 8;
/** How long a "not counting" state stays on screen after the frame that caused it. */
const SCENE_HOLD_MS = 700;
/** The test pattern's flashes: one about every 1.2 s, 50 ms long. */
const TEST_PATTERN = { flashEveryMs: 1200, flashMs: 50, flashIntensity: 1 };

// What the detector is doing, in words. Shape (the icon) and text carry the
// state; colour only adds to it.
const SCENE = {
  ok: { ok: true, text: 'Watching for hits' },
  warming: { ok: false, text: 'Starting: nothing is counted for 2 seconds' },
  paused: { ok: false, text: 'Paused: nothing is being counted' },
  motion: { ok: false, text: 'Movement in view: not counting' },
  large: { ok: false, text: 'Something lit is too big to be a hit' },
  unstable: { ok: false, text: 'The picture changed: settling' },
  adapting: { ok: false, text: 'The picture changed: settling' },
};

const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;

export function sessionScreen(root) {
  const options = appState.sessionOptions;
  root.innerHTML = `
    <main class="screen">
      <header class="app-bar"><a class="back-link" href="#/">${icons.back}Home</a></header>
      <h1 class="screen-title">Session</h1>
      <p class="banner" id="s-status" role="status" aria-live="polite"></p>

      <div class="stack" id="s-setup">
        <section class="card" aria-labelledby="s-ready-title">
          <div class="card__head"><h2 class="card__title" id="s-ready-title">Before you start</h2></div>
          <ul class="checklist">
            <li id="s-cal"></li>
            <li>${icons.circle}<span>Prop the phone so it cannot move <small>While anything in the picture is moving, nothing is counted.</small></span></li>
            <li>${icons.circle}<span>Keep this screen open <small>Locking the phone or switching apps ends the session.</small></span></li>
          </ul>
        </section>

        <details class="card" id="s-options">
          <summary>Detection settings</summary>
          <div class="controls" style="margin-top:12px">
            <div class="field">
              <label for="s-source">Source</label>
              <select id="s-source">
                <option value="environment">Rear camera</option>
                <option value="synthetic">Test pattern (simulated)</option>
              </select>
            </div>
            <div class="field">
              <label for="s-sensitivity">Sensitivity</label>
              <select id="s-sensitivity">
                <option value="60">Normal</option>
                <option value="35">High</option>
                <option value="90">Low</option>
              </select>
            </div>
            <div class="field">
              <label for="s-dot">Dot size limit</label>
              <select id="s-dot">
                <option value="normal">Normal (1% of view)</option>
                <option value="large">Large (5% of view)</option>
              </select>
            </div>
          </div>
          <p class="fine-print" style="margin-top:12px">Leave these alone for everyday use. “Large” is for testing with a bare LED. The test pattern draws its own flashes and is saved as a simulated session.</p>
        </details>

        <button class="btn btn--primary btn--block" id="s-start" type="button">${icons.play}Start session</button>
        <p class="fine-print">LaserRange only watches a target for flashes of light. It cannot tell whether a firearm is unloaded or safe. That check is always yours.</p>
      </div>

      <div class="stack" id="s-live" hidden>
        <section class="stats" aria-label="Session so far">
          <div class="stat" id="s-hits-tile"><span class="stat__value" id="s-hits">0</span><span class="stat__label">Hits</span></div>
          <div class="stat"><span class="stat__value" id="s-score">–</span><span class="stat__label">Score</span></div>
          <div class="stat"><span class="stat__value" id="s-time">0:00</span><span class="stat__label">Time</span></div>
        </section>
        <p class="scene" id="s-scene"></p>
        <p class="last-hit" id="s-last" aria-live="polite">No hits yet.</p>
        <section class="card" id="s-target-card" hidden>
          <div class="card__head"><h2 class="card__title">Target</h2><span class="tag" id="s-target-tag" hidden>Simulated</span></div>
          <div id="s-target"></div>
          ${targetLegendHtml}
        </section>
        <div class="preview preview--fit" id="s-preview">
          <video id="s-video" playsinline muted autoplay aria-label="Camera view"></video>
          <canvas class="preview__overlay" id="s-overlay" aria-hidden="true"></canvas>
        </div>
        <p class="fine-print" id="s-awake"></p>
        <div class="actions">
          <button class="btn btn--secondary" id="s-pause" type="button"></button>
          <button class="btn btn--stop" id="s-stop" type="button">${icons.stop}End session</button>
        </div>
      </div>

      <div class="stack" id="s-results" hidden>
        <div class="stack" id="s-summary"></div>
        <div class="actions">
          <button class="btn btn--primary" id="s-again" type="button">${icons.play}New session</button>
          <a class="btn btn--secondary" href="#/history">${icons.clock}History</a>
        </div>
        <button class="btn btn--secondary btn--block" id="s-retry" type="button" hidden>Try saving again</button>
        <button class="link-button" id="s-delete" type="button" hidden>Delete this session</button>
      </div>
    </main>`;

  const $ = (selector) => root.querySelector(selector);
  const video = /** @type {HTMLVideoElement} */ ($('#s-video'));
  const overlay = /** @type {HTMLCanvasElement} */ ($('#s-overlay'));
  const statusEl = $('#s-status');
  const sections = { setup: $('#s-setup'), live: $('#s-live'), results: $('#s-results') };

  let disposed = false;
  let starting = false;
  /** @type {null | Record<string, any>} the running session */
  let live = null;
  /** @type {null | import('../../sessions/metrics.js').SessionRecord} the session just finished */
  let finished = null;
  let deleteArmed = 0;

  function show(name) {
    for (const [key, element] of Object.entries(sections)) element.hidden = key !== name;
  }

  function setStatus(kind, title, detail = '') {
    const icon = kind === 'ok' ? icons.check : kind === 'error' ? icons.alert : icons.info;
    statusEl.className = `banner${kind === 'ok' ? ' banner--ok' : kind === 'error' ? ' banner--error' : ''}`;
    statusEl.innerHTML = `${icon}<span><strong></strong> <span></span></span>`;
    statusEl.querySelector('strong').textContent = title;
    statusEl.querySelector('span span').textContent = detail;
  }

  // --- setup ---------------------------------------------------------------

  function renderSetup() {
    $('#s-source').value = options.source;
    $('#s-sensitivity').value = String(options.redDelta);
    $('#s-dot').value = options.dotLimit;
    const saved = appState.calibration;
    const item = $('#s-cal');
    if (saved && saved.source === options.source) {
      item.className = 'is-done';
      item.innerHTML = `${icons.check}<span>Target calibration saved <small>Hits will be placed on the target and scored. If the phone or the target has moved since, <a href="#/calibrate">calibrate again</a>.</small></span>`;
    } else {
      item.className = '';
      item.innerHTML = `${icons.circle}<span>No target calibration${saved ? ' for this source' : ''} <small>Hits will be counted but not scored. <a href="#/calibrate">Calibrate the target</a> first to get ring scores.</small></span>`;
    }
    setStatus('info', 'Ready.', options.source === 'synthetic' ? 'The test pattern is selected: this will be a simulated session.' : 'Point the rear camera at the target, then start.');
  }

  function readOptions() {
    options.source = $('#s-source').value;
    options.redDelta = Number($('#s-sensitivity').value);
    options.dotLimit = $('#s-dot').value;
  }

  // --- running -------------------------------------------------------------

  async function start() {
    if (live || starting) return;
    readOptions();
    starting = true;
    finished = null;
    show('live');
    setStatus('info', 'Starting…', options.source === 'synthetic' ? '' : 'Your browser may ask for permission to use the camera.');

    const { source, redDelta, dotLimit } = options;
    const opened = await startVideoSession(video, { source, synthetic: TEST_PATTERN });
    if (disposed) {
      if (opened.ok) opened.session.stop();
      return;
    }
    if (!opened.ok) {
      starting = false;
      show('setup');
      setStatus('error', opened.problem.title, opened.problem.detail);
      return;
    }

    const preview = $('#s-preview');
    preview.style.setProperty('--ar', String(video.videoWidth / video.videoHeight || 4 / 3));

    // Use the saved calibration only if it was made with this source and picture size.
    const calibration = calibrationFits(appState.calibration, source, video) ? appState.calibration : null;
    const mapper = calibration ? createMapper(calibration) : null;
    const scored = Boolean(mapper);
    $('#s-target-card').hidden = !scored;
    $('#s-target-tag').hidden = source !== 'synthetic';
    preview.classList.toggle('preview--compact', scored);

    const grabber = createFrameGrabber({ width: WORKING_WIDTH });
    let pipeline = null;

    live = {
      source,
      settings: { redDelta, dotLimit },
      calibration: scored ? calibration : null,
      mapper,
      scored,
      // How big the sheet printed, from the bar measurement entered on the print screen (1 if none).
      printScale: scored ? loadPrintScale() : 1,
      hits: [],
      startedAt: new Date(),
      // Starts at the first analysed frame and stands still while paused. Hit
      // times and the session's length are read from it.
      clock: createSessionClock(),
      paused: false,
      scene: 'warming',
      disturbed: null, // { kind, at } of the latest frame that was not trusted
      video: opened.session,
      wake: null,
      flush: () => pipeline?.flush() ?? null,
      // Drops what the detector has learned. The next frame builds a new one,
      // which starts with its 2-second warm-up, so whatever changed in the
      // picture during a pause is taken as background and not counted.
      resetDetector: () => {
        pipeline = null;
      },
      stopLoop: startFrameLoop(video, (frame) => {
        if (live.paused) return;
        const image = grabber.grab(video);
        if (!image) return;
        if (!pipeline || pipeline.width !== image.width || pipeline.height !== image.height) {
          // With a calibration, only the target area is watched.
          const mask = mapper ? buildRoiMask(calibration.corners, image.width, image.height) : null;
          pipeline = createFlashPipeline(image.width, image.height, { redDelta, ...DOT_LIMITS[dotLimit] }, { mask });
        }
        live.clock.start(frame.now);
        const result = pipeline.process(image.data, frame.now);
        live.scene = result.status;
        if (result.status !== 'ok') live.disturbed = { kind: result.status, at: frame.now };
        if (result.event?.accepted) addHit(result.event);
      }),
      timer: window.setInterval(renderLive, UI_REFRESH_MS),
    };
    opened.session.onEnded(() => finish('ended'));
    starting = false;

    showRunning();
    renderPauseButton();
    $('#s-awake').textContent = '';
    renderLive();

    const wake = await keepAwake();
    if (!live) return wake.release();
    live.wake = wake;
    $('#s-awake').textContent = wake.active
      ? 'The screen is being kept awake for this session.'
      : 'This browser would not keep the screen awake. If the phone locks, the session ends: touch the screen now and then, or lengthen Auto-Lock in the phone’s settings.';
  }

  function showRunning() {
    setStatus(
      'ok',
      live.source === 'synthetic' ? 'Simulated session running.' : 'Session running.',
      live.scored ? 'Hits are placed on the target and scored.' : 'No calibration in use: hits are counted, not scored.',
    );
  }

  function renderPauseButton() {
    const button = $('#s-pause');
    const paused = Boolean(live?.paused);
    button.className = `btn ${paused ? 'btn--primary' : 'btn--secondary'}`;
    button.innerHTML = paused ? `${icons.play}Resume` : `${icons.pause}Pause`;
  }

  /** Pausing stops the counting and the clock; the camera stays open so resuming is instant. */
  function setPaused(paused) {
    if (!live || live.paused === paused) return;
    const now = performance.now();
    if (paused) {
      // A flash still being followed counts if it was a hit, as at the end of a session.
      const pending = live.flush();
      if (pending?.accepted) addHit(pending);
      live.clock.pause(now);
      live.paused = true;
      live.disturbed = null;
      live.resetDetector();
      setStatus('info', 'Session paused.', 'Nothing is counted until you resume. Locking the phone or leaving the app still ends the session.');
    } else {
      live.clock.resume(now);
      live.paused = false;
      live.scene = 'warming';
      showRunning();
    }
    renderPauseButton();
    renderLive();
  }

  function addHit(event) {
    const hit = {
      tMs: Math.round(live.clock.elapsed(event.t)),
      x: round(event.x),
      y: round(event.y),
      confidence: round(event.confidence, 2),
      frames: event.frames,
    };
    if (live.mapper) {
      const place = live.mapper.imageToTarget(event.x, event.y);
      hit.targetX = round(place.x);
      hit.targetY = round(place.y);
      hit.score = scoreHit(place, live.mapper.target);
    }
    live.hits.push(hit);
    // Restart the tile's pulse so two quick hits both show.
    const tile = $('#s-hits-tile');
    tile.classList.remove('is-pulsing');
    void tile.offsetWidth;
    tile.classList.add('is-pulsing');
    renderLive();
  }

  function draftRecord() {
    return { hits: live.hits, scored: live.scored, targetId: live.calibration?.targetId ?? null, printScale: live.printScale };
  }

  function renderLive() {
    if (!live) return;
    const summary = summarizeSession(draftRecord());
    $('#s-hits').textContent = String(summary.hits);
    $('#s-score').textContent = summary.scored ? String(summary.score) : '–';
    $('#s-time').textContent = formatClock(live.clock.elapsed(performance.now()));

    // Hold a "not counting" state briefly so a single odd frame is still readable.
    const recent = live.disturbed && performance.now() - live.disturbed.at < SCENE_HOLD_MS ? live.disturbed.kind : null;
    const scene = live.paused ? SCENE.paused : (SCENE[live.scene === 'ok' && recent ? recent : live.scene] ?? SCENE.ok);
    const sceneEl = $('#s-scene');
    sceneEl.className = `scene${scene.ok ? ' scene--ok' : ''}`;
    sceneEl.innerHTML = `${scene.ok ? icons.check : icons.info}<span></span>`;
    sceneEl.querySelector('span').textContent = scene.text;

    const last = live.hits[live.hits.length - 1];
    if (last) {
      const where = live.scored ? (last.score > 0 ? `ring ${last.score}` : 'outside the rings') : 'counted';
      $('#s-last').textContent = `Hit ${live.hits.length}: ${where} at ${formatClock(last.tMs)} · ${confidenceWord(last.confidence)} signal`;
    }

    if (live.scored) {
      const { points } = targetPoints(draftRecord());
      $('#s-target').innerHTML = targetOverlaySvg({
        hits: points,
        target: live.mapper.target,
        label: `Target with ${points.length} hit${points.length === 1 ? '' : 's'} so far`,
      });
    }
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
    if (!live) return;

    if (live.calibration) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(99, 212, 175, 0.8)';
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      live.calibration.corners.forEach((corner, i) => (i === 0 ? ctx.moveTo(corner.x * w, corner.y * h) : ctx.lineTo(corner.x * w, corner.y * h)));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const recent = live.hits.slice(-PREVIEW_MARKERS);
    recent.forEach((hit, i) => {
      const newest = i === recent.length - 1;
      ctx.strokeStyle = '#f3a65e';
      ctx.lineWidth = newest ? 3.5 : 2;
      ctx.beginPath();
      ctx.arc(hit.x * w, hit.y * h, newest ? 13 : 10, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  // --- finishing -----------------------------------------------------------

  /** @param {'user' | 'hidden' | 'ended' | 'unmount'} reason */
  function finish(reason) {
    if (!live) return;
    const session = live;
    window.clearInterval(session.timer);
    session.stopLoop();
    // A flash still being followed when the session ends counts if it was a hit.
    const pending = session.flush();
    if (pending?.accepted) addHit(pending);
    live = null;
    session.video.stop();
    session.wake?.release();

    const endedAt = new Date();
    const now = performance.now();
    /** @type {import('../../sessions/metrics.js').SessionRecord} */
    const record = {
      id: newSessionId(session.startedAt.getTime()),
      schema: 1,
      startedAt: session.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: Math.round(session.clock.elapsed(now)),
      pausedMs: Math.round(session.clock.pausedMs(now)),
      source: session.source,
      simulated: session.source === 'synthetic',
      scored: session.scored,
      targetId: session.calibration?.targetId ?? null,
      ...(session.scored ? { printScale: session.printScale } : {}),
      settings: session.settings,
      build: BUILD_ID,
      hits: session.hits,
    };
    finished = record;

    const why =
      reason === 'hidden'
        ? 'The session ended because the app went to the background or the phone locked. '
        : reason === 'ended'
          ? 'The session ended because the system stopped the camera. '
          : '';
    if (record.hits.length === 0) {
      if (reason !== 'unmount') showResults('info', 'Session ended.', `${why}No hits were detected, so nothing was saved.`, { saved: false });
      return;
    }
    save(record, why, reason === 'unmount');
  }

  async function save(record, why = '', silent = false) {
    try {
      const store = await getSessionStore();
      await store.save(record);
      if (!silent && !disposed) showResults('ok', 'Session saved on this device.', why, { saved: true });
    } catch (error) {
      if (!silent && !disposed) {
        showResults('error', 'This session could not be saved.', `${why}${error?.message ?? 'The browser refused to store it.'} It is still shown below until you leave this screen.`, {
          saved: false,
          retry: true,
        });
      }
    }
  }

  function showResults(kind, title, detail, { saved, retry = false }) {
    $('#s-summary').innerHTML = sessionSummaryHtml(finished);
    $('#s-retry').hidden = !retry;
    const deleteBtn = $('#s-delete');
    deleteBtn.hidden = !saved;
    deleteBtn.textContent = 'Delete this session';
    deleteArmed = 0;
    show('results');
    setStatus(kind, title, detail);
    window.scrollTo(0, 0);
  }

  async function deleteFinished() {
    const button = $('#s-delete');
    // Two taps, so a slip of the thumb does not lose a session.
    if (Date.now() - deleteArmed > 4000) {
      deleteArmed = Date.now();
      button.textContent = 'Tap again to delete for good';
      return;
    }
    try {
      const store = await getSessionStore();
      await store.remove(finished.id);
      button.hidden = true;
      setStatus('info', 'Session deleted.', 'It is still shown below until you leave this screen.');
    } catch {
      setStatus('error', 'The session could not be deleted.', 'Try again from History.');
    }
  }

  const onVisibility = () => {
    if (document.hidden) finish('hidden');
  };

  $('#s-start').addEventListener('click', start);
  $('#s-stop').addEventListener('click', () => finish('user'));
  $('#s-pause').addEventListener('click', () => setPaused(!live?.paused));
  $('#s-again').addEventListener('click', () => {
    show('setup');
    renderSetup();
    window.scrollTo(0, 0);
  });
  $('#s-retry').addEventListener('click', () => save(finished));
  $('#s-delete').addEventListener('click', deleteFinished);
  $('#s-source').addEventListener('change', () => {
    readOptions();
    renderSetup();
  });
  document.addEventListener('visibilitychange', onVisibility);

  // Open the settings straight away when they are not the everyday ones, so a
  // test setup left over from last time is not hidden.
  if (options.source !== 'environment' || options.redDelta !== 60 || options.dotLimit !== 'normal') $('#s-options').open = true;
  renderSetup();

  return () => {
    finish('unmount');
    disposed = true;
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
