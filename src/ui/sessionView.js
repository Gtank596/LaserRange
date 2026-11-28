import { CHECK_BAR_MM, safePrintScale } from '../calibration/printScale.js';
import { getTarget } from '../calibration/targets.js';
import { confidenceWord } from '../detection/params.js';
import { describeFlashLengths, flashLengths, summarizeSession } from '../sessions/metrics.js';
import { describeSkips } from '../sessions/skips.js';
import { targetLegendHtml, targetOverlaySvg } from './targetOverlay.js';

// Shared markup for showing a session: used by the results at the end of a
// session, by History, and by the dashboard.

/** 75000 -> "1:15" */
export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** "Nov 27, 2026, 2:15 PM" in the device's own style. */
export function formatWhen(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const SENSITIVITY_NAMES = { 60: 'Normal', 35: 'High', 90: 'Low' };
const DOT_NAMES = { normal: 'Normal', large: 'Large' };

/** Labels that must travel with a session wherever it is shown. */
export function sessionTagsHtml(session) {
  const tags = [];
  if (session.simulated) tags.push('<span class="tag">Simulated</span>');
  if (!session.scored) tags.push('<span class="tag tag--plain">Not scored</span>');
  return tags.join('');
}

/** The three headline tiles. Score and accuracy show a dash when the session was not scored. */
export function sessionStatsHtml(summary, label = 'Session summary') {
  const score = summary.scored ? summary.score : '–';
  const accuracy = summary.scored && summary.accuracyPct !== null ? `${summary.accuracyPct}%` : '–';
  return `
    <section class="stats" aria-label="${label}">
      <div class="stat"><span class="stat__value">${summary.hits}</span><span class="stat__label">Hits</span></div>
      <div class="stat"><span class="stat__value">${score}</span><span class="stat__label">Score</span></div>
      <div class="stat"><span class="stat__value">${accuracy}</span><span class="stat__label">Accuracy</span></div>
    </section>`;
}

/** Hits as target-overlay points. Hits beyond the drawing's edge are left out and counted. */
export function targetPoints(session) {
  const inView = session.hits.filter((hit) => Math.hypot(hit.targetX, hit.targetY) <= 1.03);
  return { points: inView.map((hit) => ({ x: hit.targetX, y: hit.targetY })), outside: session.hits.length - inView.length };
}

/** The hit map card for a scored session, or a plain note for one that was not scored. */
export function sessionMapHtml(session, { title = 'Hit map' } = {}) {
  if (!session.scored) {
    return `
      <section class="card">
        <div class="card__head"><h2 class="card__title">${title}</h2>${sessionTagsHtml(session)}</div>
        <p class="fine-print">This session had no target calibration, so hits were counted but not placed on the target or scored.</p>
      </section>`;
  }
  const target = getTarget(session.targetId ?? undefined);
  const { points, outside } = targetPoints(session);
  return `
    <section class="card">
      <div class="card__head"><h2 class="card__title">${title}</h2>${sessionTagsHtml(session)}</div>
      ${targetOverlaySvg({ hits: points, target, label: `Target with ${points.length} hit${points.length === 1 ? '' : 's'} marked` })}
      ${targetLegendHtml}
      ${outside ? `<p class="fine-print">${outside} hit${outside === 1 ? '' : 's'} landed outside the rings and ${outside === 1 ? 'is' : 'are'} not drawn.</p>` : ''}
    </section>`;
}

/** What the millimetre figure rests on: an entered bar measurement, or the assumption of a full-size print. */
function groupBasis(session) {
  const scale = safePrintScale(session.printScale);
  return scale === 1
    ? 'if the target was printed at full size'
    : `using the sheet’s check bar measured at ${Math.round(scale * CHECK_BAR_MM * 10) / 10} mm`;
}

function hitRowsHtml(session) {
  return session.hits
    .map((hit, i) => {
      const where = session.scored
        ? hit.score > 0
          ? `Ring ${hit.score}`
          : 'Outside the rings'
        : `${Math.round(hit.x * 100)}% across, ${Math.round(hit.y * 100)}% down`;
      return `<tr><td>${i + 1}</td><td>${formatClock(hit.tMs)}</td><td>${where}</td><td>${confidenceWord(hit.confidence)}</td></tr>`;
    })
    .join('');
}

/**
 * Everything about one finished session: tiles, hit map, details, hit list.
 * @param {import('../sessions/metrics.js').SessionRecord} session
 */
export function sessionSummaryHtml(session) {
  const summary = summarizeSession(session);
  const lengths = flashLengths(session.hits);
  const group =
    summary.scored && summary.groupMm !== null
      ? `${summary.groupMm.toFixed(0)} mm <small>widest distance between two hits, ${groupBasis(session)}</small>`
      : summary.scored
        ? 'needs two hits'
        : 'needs a calibration';
  return `
    ${
      session.simulated
        ? `<p class="banner banner--sample" role="note"><span><strong>Simulated session.</strong> These hits were drawn by the app's test pattern, not seen by a camera.</span></p>`
        : ''
    }
    ${sessionStatsHtml(summary)}
    ${sessionMapHtml(session)}
    <section class="card">
      <div class="card__head"><h2 class="card__title">Details</h2></div>
      <dl class="metrics">
        <div class="metric metric--wide"><dt>Started</dt><dd>${formatWhen(session.startedAt)}</dd></div>
        <div class="metric"><dt>Length</dt><dd>${formatClock(session.durationMs)}${session.pausedMs >= 1000 ? ` <small>plus ${formatClock(session.pausedMs)} paused</small>` : ''}</dd></div>
        <div class="metric"><dt>On the rings</dt><dd>${summary.scored ? `${summary.onTarget} of ${summary.hits}` : '–'}</dd></div>
        <div class="metric metric--wide"><dt>Group size</dt><dd>${group}</dd></div>
        ${
          session.notCounted
            ? `<div class="metric metric--wide"><dt>Seen but not counted</dt><dd>${describeSkips(session.notCounted)} <small>(times the app saw something and chose not to count it; a flash the camera never caught is not here)</small></dd></div>`
            : ''
        }
        ${
          lengths
            ? `<div class="metric metric--wide"><dt>Each flash stayed lit</dt><dd>${describeFlashLengths(lengths)} <small>(as the camera saw it, to the nearest video frame)</small></dd></div>`
            : ''
        }
        <div class="metric"><dt>Source</dt><dd>${session.simulated ? 'Test pattern' : 'Rear camera'}</dd></div>
        <div class="metric"><dt>Detection</dt><dd>${SENSITIVITY_NAMES[session.settings?.redDelta] ?? session.settings?.redDelta} · dot ${DOT_NAMES[session.settings?.dotLimit] ?? session.settings?.dotLimit}</dd></div>
      </dl>
    </section>
    ${
      session.hits.length
        ? `<section class="card">
            <div class="card__head"><h2 class="card__title">Hits</h2></div>
            <table class="hit-table">
              <thead><tr><th scope="col">#</th><th scope="col">Time</th><th scope="col">${session.scored ? 'Score' : 'Place in the picture'}</th><th scope="col">Signal</th></tr></thead>
              <tbody>${hitRowsHtml(session)}</tbody>
            </table>
          </section>`
        : ''
    }
    <p class="fine-print">A session records what the camera detected. A flash it did not see cannot be counted and is not shown as a miss. Detection has been measured with an LED test light and tried with a laser cartridge; how many cartridge flashes it misses has not been measured.</p>`;
}
