import { summarizeHits } from '../../calibration/scoring.js';
import { SAMPLE_HITS } from '../../sessions/sampleData.js';
import { icons } from '../../ui/icons.js';
import { targetLegendHtml, targetOverlaySvg } from '../../ui/targetOverlay.js';
import { attachBuildFooter, buildFooterHtml } from '../build.js';
import { appState } from '../state.js';

export function homeScreen(root) {
  // Stats are computed from the sample hits (not hard-coded) so the tiles and
  // the hit map always agree with each other.
  const summary = summarizeHits(SAMPLE_HITS);
  const check = appState.cameraCheck;

  // Readiness chips show REAL state, unlike the sample stats above them.
  const cameraChip = check
    ? `<li class="chip chip--ok">${icons.check}Camera checked · ${check.observedFps ? `${check.observedFps.toFixed(0)} fps observed` : 'no frame rate yet'}</li>`
    : `<li class="chip">${icons.circle}Camera not checked</li>`;

  root.innerHTML = `
    <main class="screen">
      <header class="app-bar">
        <h1 class="brand">${icons.logo}<span>LASERRANGE</span></h1>
        <span class="chip chip--demo">${icons.flask}Demo build</span>
      </header>

      <p class="banner banner--sample" role="note">
        ${icons.info}
        <span><strong>Sample data.</strong> The numbers and hits below are illustrative, not from a real session.</span>
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
        <ul class="readiness" aria-label="Readiness">
          ${cameraChip}
          <li class="chip">${icons.circle}Not calibrated</li>
        </ul>
      </section>

      <nav class="actions" aria-label="Main actions">
        <a class="btn btn--primary" href="#/session">${icons.play}Start session</a>
        <a class="btn btn--secondary" href="#/history">${icons.clock}History</a>
      </nav>

      <a class="row-link" href="#/camera">
        ${icons.camera}
        <span class="row-link__text">Camera check<small>Measure real frame timing on this device</small></span>
        ${icons.forward}
      </a>

      ${buildFooterHtml}
    </main>`;

  attachBuildFooter(root);
}
