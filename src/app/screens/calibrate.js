import { createMapper, validateCorners } from '../../calibration/calibration.js';
import { findTargetSquare } from '../../calibration/findSquare.js';
import { calibrationFits, clearCalibration, saveCalibration } from '../../calibration/store.js';
import { DEFAULT_TARGET_ID, frameShare, getTarget } from '../../calibration/targets.js';
import { createFrameGrabber } from '../../camera/frameSampler.js';
import { startVideoSession } from '../../camera/videoSession.js';
import { icons } from '../../ui/icons.js';
import { attachBuildFooter, buildFooterHtml } from '../build.js';
import { appState } from '../state.js';

const CORNER_NAMES = ['top left', 'top right', 'bottom right', 'bottom left'];
const LOUPE_SIZE = 132; // CSS pixels
const LOUPE_ZOOM = 3;
/** Widest picture the square finder looks at. Bigger is slower; smaller loses a thin border. */
const FIND_WIDTH = 960;
/** How long after the camera starts the finder is first tried, so the picture has settled. */
const FIND_DELAY_MS = 700;

// Why the finder came up empty, in words someone can act on.
const NOT_FOUND = {
  nothing:
    'Nothing in view looks like the black border. Use the sheet with the bold black border, keep all of it in the picture, and move closer if the square is small. Or drag the markers by hand.',
  unclear:
    'Something like a border is in view, but it does not match the printed one. Check that nothing covers or shades the border, that there is white paper all round it, and that all of it is in the picture. Or drag the markers by hand.',
};

const defaultCorners = () => [
  { x: 0.2, y: 0.2 },
  { x: 0.8, y: 0.2 },
  { x: 0.8, y: 0.8 },
  { x: 0.2, y: 0.8 },
];

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const SOURCE_NAMES = { environment: 'rear camera', synthetic: 'test pattern' };

export function calibrateScreen(root) {
  const target = getTarget();
  root.innerHTML = `
    <main class="screen">
      <header class="app-bar"><a class="back-link" href="#/">${icons.back}Home</a></header>
      <h1 class="screen-title">Place the corners by hand</h1>
      <p class="lede">You do not normally need this screen: a session finds the printed target by itself when it starts. Use it when the app cannot find the target. Put the four markers on the outer corners of the black border, so that the rings drawn over the picture sit on the printed rings, and save.</p>

      <p class="banner" id="cal-status" role="status" aria-live="polite"></p>

      <div class="preview preview--fit preview--open" id="cal-preview">
        <video id="cal-video" playsinline muted autoplay aria-label="Camera view of the target"></video>
        <canvas class="preview__overlay" id="cal-overlay" aria-hidden="true"></canvas>
        <canvas class="loupe" id="cal-loupe" aria-hidden="true" hidden></canvas>
        ${CORNER_NAMES.map(
          (name, i) =>
            `<button class="corner" type="button" data-corner="${i}" hidden aria-label="Corner ${i + 1}, ${name} of the printed square. Drag it, or use the arrow keys."><span aria-hidden="true">${i + 1}</span></button>`,
        ).join('')}
        <div class="preview__placeholder" id="cal-placeholder">${icons.camera}<span>Camera is off</span></div>
      </div>

      <div class="controls">
        <div class="field">
          <label for="cal-source">Source</label>
          <select id="cal-source">
            <option value="environment">Rear camera</option>
            <option value="synthetic">Test pattern</option>
          </select>
        </div>
        <div class="field">
          <span class="field__label">Markers</span>
          <button class="btn btn--secondary" id="cal-reset" type="button" disabled>Reset</button>
        </div>
      </div>

      <button class="btn btn--secondary btn--block" id="cal-find" type="button" hidden>${icons.target}Find the square</button>

      <div class="actions">
        <button class="btn btn--secondary" id="cal-toggle" type="button"></button>
        <button class="btn btn--primary" id="cal-save" type="button" disabled>${icons.check}Save</button>
      </div>

      <section class="card" aria-labelledby="cal-saved-title">
        <div class="card__head"><h2 class="card__title" id="cal-saved-title">Corners saved by hand</h2></div>
        <p id="cal-saved"></p>
        <button class="btn btn--secondary btn--block" id="cal-clear" type="button" style="margin-top:12px" hidden>Remove saved corners</button>
      </section>

      <a class="row-link" href="#/print">
        ${icons.target}
        <span class="row-link__text">Print the target<small>${target.name}, ${target.squareMm} mm square</small></span>
        ${icons.forward}
      </a>

      <details class="card">
        <summary>Getting a good calibration</summary>
        <ul class="notes">
          <li>Fix the phone in place first (a tripod or a stack of books). If the phone or the target moves afterwards, calibrate again.</li>
          <li>“Find the square” looks for the bold black border. It needs the whole border in the picture, white paper showing all round it, and the square filling at least an eighth of the picture’s shorter side. It has been tried on drawn pictures only, so check its answer against the rings.</li>
          <li>The corners are the outer corners of the black border. Marker 1 goes on the top-left one, then 2, 3 and 4 clockwise.</li>
          <li>While you drag, a magnified view appears so your finger does not hide the corner. On a keyboard, arrow keys nudge a marker; hold Shift for bigger steps.</li>
          <li>The camera does not need to be square-on. An angled view is corrected, but a very steep angle makes positions less precise.</li>
          <li>Accuracy has only been checked with known points in software so far, not against a measured printed target.</li>
        </ul>
      </details>

      ${buildFooterHtml}
    </main>`;

  attachBuildFooter(root);

  const $ = (selector) => root.querySelector(selector);
  const video = /** @type {HTMLVideoElement} */ ($('#cal-video'));
  const preview = $('#cal-preview');
  const overlay = /** @type {HTMLCanvasElement} */ ($('#cal-overlay'));
  const loupe = /** @type {HTMLCanvasElement} */ ($('#cal-loupe'));
  const placeholder = $('#cal-placeholder');
  const statusEl = $('#cal-status');
  const toggleBtn = $('#cal-toggle');
  const saveBtn = $('#cal-save');
  const resetBtn = $('#cal-reset');
  const findBtn = $('#cal-find');
  const clearBtn = $('#cal-clear');
  const sourceSel = $('#cal-source');
  const handles = [...root.querySelectorAll('.corner')];

  let disposed = false;
  let starting = false;
  let session = null;
  let corners = defaultCorners();
  let dragging = -1;
  let grabber = null;
  let findTimer = 0;

  function setStatus(kind, title, detail = '') {
    const icon = kind === 'ok' ? icons.check : kind === 'error' ? icons.alert : icons.info;
    statusEl.className = `banner${kind === 'ok' ? ' banner--ok' : kind === 'error' ? ' banner--error' : ''}`;
    statusEl.innerHTML = `${icon}<span><strong></strong> <span></span></span>`;
    statusEl.querySelector('strong').textContent = title;
    statusEl.querySelector('span span').textContent = detail;
  }

  function renderSaved() {
    const saved = appState.calibration;
    $('#cal-saved').textContent = saved
      ? `Saved ${new Date(saved.savedAt).toLocaleString()} for the ${SOURCE_NAMES[saved.source] ?? saved.source} at ${saved.video.width} × ${saved.video.height}.`
      : 'None yet.';
    clearBtn.hidden = !saved;
  }

  function renderControls() {
    const running = Boolean(session);
    toggleBtn.innerHTML = running ? `${icons.stop}Stop` : `${icons.play}${starting ? 'Starting…' : 'Start camera'}`;
    toggleBtn.disabled = starting;
    sourceSel.disabled = running || starting;
    resetBtn.disabled = !running;
    findBtn.hidden = !running;
    handles.forEach((handle) => (handle.hidden = !running));
    placeholder.hidden = running;
    saveBtn.disabled = !running || !validateCorners(corners).ok;
  }

  /** Positions the markers, redraws the rings, and reports problems with the shape. */
  function render() {
    handles.forEach((handle, i) => {
      handle.style.left = `${corners[i].x * 100}%`;
      handle.style.top = `${corners[i].y * 100}%`;
    });
    drawOverlay();
    if (!session) return;
    const check = validateCorners(corners);
    saveBtn.disabled = !check.ok;
    if (check.ok) setStatus('info', 'Line up the markers.', 'Press “Find the square”, or drag them. When the drawn rings sit on the printed rings, press Save.');
    else setStatus('error', 'These corners cannot be used.', check.reason);
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
    if (!session) return;

    const mapper = createMapper({ corners });

    // The square itself: solid when usable, dashed when not.
    ctx.lineWidth = 2;
    ctx.strokeStyle = mapper ? '#63d4af' : '#ff9d9d';
    ctx.setLineDash(mapper ? [] : [6, 5]);
    ctx.beginPath();
    corners.forEach((corner, i) => (i === 0 ? ctx.moveTo(corner.x * w, corner.y * h) : ctx.lineTo(corner.x * w, corner.y * h)));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    if (!mapper) return;

    // Where the rings should appear in the picture for these corners.
    const line = (points) => {
      ctx.beginPath();
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * w, p.y * h) : ctx.lineTo(p.x * w, p.y * h)));
      ctx.stroke();
    };
    ctx.strokeStyle = '#f3a65e';
    for (let k = 2; k <= mapper.target.ringCount; k += 2) {
      const r = k / mapper.target.ringCount;
      const points = [];
      for (let step = 0; step <= 72; step++) {
        const angle = (step / 72) * Math.PI * 2;
        points.push(mapper.targetToImage(r * Math.cos(angle), r * Math.sin(angle)));
      }
      ctx.lineWidth = k === mapper.target.ringCount ? 2 : 1.2;
      line(points);
    }
    ctx.lineWidth = 1;
    line([mapper.targetToImage(-1, 0), mapper.targetToImage(1, 0)]);
    line([mapper.targetToImage(0, -1), mapper.targetToImage(0, 1)]);
  }

  /** Shows a magnified piece of the live video around a corner while it is dragged. */
  function drawLoupe(index) {
    const dpr = window.devicePixelRatio || 1;
    if (loupe.width !== LOUPE_SIZE * dpr) {
      loupe.width = LOUPE_SIZE * dpr;
      loupe.height = LOUPE_SIZE * dpr;
    }
    const corner = corners[index];
    // Keep the loupe on the opposite side of the picture from the finger.
    loupe.style.left = corner.x < 0.5 ? 'auto' : '8px';
    loupe.style.right = corner.x < 0.5 ? '8px' : 'auto';
    loupe.hidden = false;

    const scale = video.videoWidth / preview.clientWidth; // video pixels per CSS pixel
    const span = (LOUPE_SIZE / LOUPE_ZOOM) * scale;
    const ctx = loupe.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    ctx.drawImage(
      video,
      corner.x * video.videoWidth - span / 2,
      corner.y * video.videoHeight - span / 2,
      span,
      span,
      0,
      0,
      LOUPE_SIZE,
      LOUPE_SIZE,
    );
    const mid = LOUPE_SIZE / 2;
    ctx.strokeStyle = '#f3a65e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mid, 8);
    ctx.lineTo(mid, mid - 5);
    ctx.moveTo(mid, mid + 5);
    ctx.lineTo(mid, LOUPE_SIZE - 8);
    ctx.moveTo(8, mid);
    ctx.lineTo(mid - 5, mid);
    ctx.moveTo(mid + 5, mid);
    ctx.lineTo(LOUPE_SIZE - 8, mid);
    ctx.stroke();
  }

  /**
   * Looks for the printed border in the current picture and, if it is there,
   * puts the markers on its corners.
   * @param {{ quiet?: boolean }} [options] quiet: say nothing when it is not found (the automatic first try)
   */
  function findSquare({ quiet = false } = {}) {
    if (!session || dragging >= 0) return;
    const image = grabber?.grab(video);
    const result = image
      ? findTargetSquare(image.data, image.width, image.height, { frameShare: frameShare(target) })
      : { found: false, reason: 'nothing' };
    if (result.found) {
      corners = result.corners.map((corner) => ({ x: clamp01(corner.x), y: clamp01(corner.y) }));
      render();
      if (validateCorners(corners).ok) {
        setStatus('ok', 'Found the printed square.', 'Check that the drawn rings sit on the printed rings, then press Save. Drag a marker if one is off.');
      }
      return;
    }
    if (!quiet) setStatus('error', 'Could not find the printed square.', NOT_FOUND[result.reason] ?? NOT_FOUND.nothing);
  }

  function moveCorner(index, x, y) {
    corners[index] = { x: clamp01(x), y: clamp01(y) };
    render();
  }

  handles.forEach((handle, index) => {
    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      dragging = index;
      handle.focus({ preventScroll: true });
      drawLoupe(index);
    });
    handle.addEventListener('pointermove', (event) => {
      if (dragging !== index) return;
      const box = preview.getBoundingClientRect();
      moveCorner(index, (event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
      drawLoupe(index);
    });
    const release = () => {
      if (dragging !== index) return;
      dragging = -1;
      loupe.hidden = true;
    };
    handle.addEventListener('pointerup', release);
    handle.addEventListener('pointercancel', release);
    handle.addEventListener('keydown', (event) => {
      const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1; // CSS pixels
      moveCorner(
        index,
        corners[index].x + (move[0] * step) / preview.clientWidth,
        corners[index].y + (move[1] * step) / preview.clientHeight,
      );
    });
  });

  async function start() {
    if (session || starting) return;
    const source = sourceSel.value;
    starting = true;
    renderControls();
    setStatus('info', 'Starting…', source === 'synthetic' ? '' : 'Your browser may ask for permission to use the camera.');

    // A test pattern with no flashes: nothing should distract from lining up corners.
    const result = await startVideoSession(video, { source, synthetic: { flashEveryMs: 1e12 } });
    starting = false;
    if (disposed) {
      if (result.ok) result.session.stop();
      return;
    }
    if (!result.ok) {
      setStatus('error', result.problem.title, result.problem.detail);
      statusEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      renderControls();
      return;
    }

    session = result.session;
    session.source = source;
    session.onEnded(() => stop('ended'));
    preview.style.setProperty('--ar', String(video.videoWidth / video.videoHeight || 4 / 3));

    // Start from the saved corners when they were made with this same source and frame size.
    const saved = appState.calibration;
    const restored = calibrationFits(saved, source, video);
    corners = restored ? saved.corners.map((corner) => ({ ...corner })) : defaultCorners();
    grabber = createFrameGrabber({ width: Math.min(FIND_WIDTH, video.videoWidth || FIND_WIDTH) });
    renderControls();
    render();
    // With nothing saved to start from, look for the square straight away.
    if (!restored) findTimer = window.setTimeout(() => findSquare({ quiet: true }), FIND_DELAY_MS);
  }

  /** @param {'user' | 'hidden' | 'ended' | 'unmount'} reason */
  function stop(reason) {
    if (!session) return;
    window.clearTimeout(findTimer);
    session.stop();
    session = null;
    grabber = null;
    loupe.hidden = true;
    if (reason === 'unmount') return;
    renderControls();
    drawOverlay();
    if (reason === 'ended') setStatus('error', 'The camera was stopped by the system.', 'Start it again to continue.');
    else if (reason === 'hidden') setStatus('info', 'Paused while in the background.', 'Start the camera again to continue.');
    else setStatus('info', 'Camera is off.', appState.calibration ? 'Your saved corners are kept.' : '');
  }

  function save() {
    if (!session || !validateCorners(corners).ok) return;
    const calibration = {
      version: 1,
      targetId: DEFAULT_TARGET_ID,
      corners: corners.map((corner) => ({ ...corner })),
      video: { width: video.videoWidth, height: video.videoHeight },
      source: session.source,
      savedAt: new Date().toISOString(),
    };
    appState.calibration = calibration;
    const stored = saveCalibration(calibration);
    renderSaved();
    setStatus(
      'ok',
      'Corners saved.',
      stored
        ? 'Your next session will use these corners. They are only right until the phone or the target moves.'
        : 'Your next session will use these corners, until you close the app; this browser would not store them.',
    );
    // Saving corners by hand is a request to use them.
    appState.sessionOptions.targetMode = 'saved';
  }

  const onVisibility = () => {
    if (document.hidden) stop('hidden');
  };
  const onResize = () => drawOverlay();

  toggleBtn.addEventListener('click', () => (session ? stop('user') : start()));
  saveBtn.addEventListener('click', save);
  resetBtn.addEventListener('click', () => {
    corners = defaultCorners();
    render();
  });
  findBtn.addEventListener('click', () => findSquare());
  clearBtn.addEventListener('click', () => {
    appState.calibration = null;
    appState.sessionOptions.targetMode = 'auto';
    clearCalibration();
    renderSaved();
    setStatus('info', 'Saved corners removed. Sessions will find the target automatically.');
  });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize);

  setStatus('info', 'Camera is off.', 'Point the phone at the printed target, then press Start camera.');
  renderSaved();
  renderControls();

  return () => {
    disposed = true;
    stop('unmount');
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onResize);
  };
}
