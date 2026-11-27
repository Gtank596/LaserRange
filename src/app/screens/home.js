import { summarizeHits } from '../../calibration/scoring.js';
import { summarizeSession } from '../../sessions/metrics.js';
import { SAMPLE_HITS } from '../../sessions/sampleData.js';
import { getSessionStore } from '../../sessions/store.js';
import { icons } from '../../ui/icons.js';
import { formatWhen, sessionMapHtml, sessionStatsHtml } from '../../ui/sessionView.js';
import { targetLegendHtml, targetOverlaySvg } from '../../ui/targetOverlay.js';
import { attachBuildFooter, buildFooterHtml } from '../build.js';
import { appState } from '../state.js';

/** The dashboard before any session has been saved: sample data, labeled as such. */
function sampleHtml() {
  // Stats are computed from the sample hits (not hard-coded) so the tiles and
  // the hit map always agree with each other.
  const summary = summarizeHits(SAMPLE_HITS);
  return `
    <p class="banner banner--sample" role="note">
      ${icons.info}
      <span><strong>Sample data.</strong> No session has been saved yet. The numbers and hits below are illustrative, not from a real session.</span>
    </p>
    <section class="stats" aria-label="Sample session summary (illustrative)">
      <div class="stat"><span class="stat__value">${summary.hits}</span><span class="stat__label">Hits</span></div>
      <div class="stat"><span class="stat__value">${summary.score}</span><span class="stat__label">Score</span></div>
      <div class="stat"><span class="stat__value">${summary.accuracyPct}%</span><span class="stat__label">Accuracy</span></div>
    </section>
    <section class="card" aria-labelledby="target-title">
      <div class="card__head">
        <h2 class="card__title" id="target-title">Target</h2>
        <span class="tag">Sample</span>
      </div>
      ${targetOverlaySvg({ hits: SAMPLE_HITS, label: `Sample target showing ${summary.hits} illustrative hits` })}
      ${targetLegendHtml}
    </section>`;
}

/** The dashboard once a session exists: the most recent one, from this device's storage. */
function latestHtml(session) {
  return `
    <p class="banner" role="note">
      ${icons.clock}
      <span><strong>Last session.</strong> ${formatWhen(session.startedAt)}${session.simulated ? ' · simulated with the test pattern' : ''}. <a href="#/history/${encodeURIComponent(session.id)}">Details</a></span>
    </p>
    ${sessionStatsHtml(summarizeSession(session), 'Last session summary')}
    ${sessionMapHtml(session, { title: 'Target' })}`;
}

export function homeScreen(root) {
  const check = appState.cameraCheck;

  // Readiness chips show real state.
  const cameraChip = check
    ? `<li class="chip chip--ok">${icons.check}Camera checked · ${check.observedFps ? `${check.observedFps.toFixed(0)} fps observed` : 'no frame rate yet'}</li>`
    : `<li class="chip">${icons.circle}Camera not checked</li>`;

  root.innerHTML = `
    <main class="screen">
      <header class="app-bar">
        <h1 class="brand">${icons.logo}<span>LASERRANGE</span></h1>
        <span class="chip chip--demo">${icons.flask}Demo build</span>
      </header>

      <div class="stack" id="home-summary" aria-live="polite"></div>

      <ul class="readiness" aria-label="Readiness">
        ${cameraChip}
        ${
          appState.calibration
            ? `<li class="chip chip--ok">${icons.check}Calibration saved</li>`
            : `<li class="chip">${icons.circle}Not calibrated</li>`
        }
      </ul>

      <nav class="actions" aria-label="Main actions">
        <a class="btn btn--primary" href="#/session">${icons.play}Start session</a>
        <a class="btn btn--secondary" href="#/history">${icons.clock}History</a>
      </nav>

      <a class="row-link" href="#/calibrate">
        ${icons.target}
        <span class="row-link__text">Calibrate target<small>Line up the printed square so hits can be scored</small></span>
        ${icons.forward}
      </a>

      <a class="row-link" href="#/camera">
        ${icons.camera}
        <span class="row-link__text">Camera check<small>Measure real frame timing on this device</small></span>
        ${icons.forward}
      </a>

      <a class="row-link" href="#/lab">
        ${icons.pulse}
        <span class="row-link__text">Detection lab<small>Try flash detection and read its measurements</small></span>
        ${icons.forward}
      </a>

      ${buildFooterHtml}
    </main>`;

  attachBuildFooter(root);

  // The summary is filled in once storage has answered: the newest saved
  // session if there is one, otherwise the labeled sample.
  const summaryEl = root.querySelector('#home-summary');
  let disposed = false;
  getSessionStore()
    .then((store) => store.list({ limit: 1 }))
    .catch(() => [])
    .then(([latest]) => {
      if (!disposed) summaryEl.innerHTML = latest ? latestHtml(latest) : sampleHtml();
    });

  return () => {
    disposed = true;
  };
}
