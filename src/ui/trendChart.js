import { describeTrend, layoutTrend, TREND_LIMIT } from '../sessions/trends.js';
import { formatWhen } from './sessionView.js';

// One small line chart per measure for History: a value per saved session,
// oldest on the left. Each chart has its own scale starting at zero. The words
// above and below the plot carry everything the line does, and the session
// list under the charts holds every session, so nothing depends on reading the
// drawing or on colour.

const WIDTH = 320;
const HEIGHT = 140;
const PLOT = { left: 34, right: 14, top: 12, bottom: 24 };
const PLOT_W = WIDTH - PLOT.left - PLOT.right;
const PLOT_H = HEIGHT - PLOT.top - PLOT.bottom;
const DOT_R = 4;
const DOT_R_SELECTED = 6;

const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const amount = (value, unit) => `${value}${unit}`;
const sessionsWord = (count) => `${count} session${count === 1 ? '' : 's'}`;

function place(trend) {
  const layout = layoutTrend(trend.points, { width: PLOT_W, height: PLOT_H, fixedMax: trend.fixedMax });
  return { ...layout, points: layout.points.map((p) => ({ ...p, cx: PLOT.left + p.px, cy: PLOT.top + p.py })) };
}

/**
 * The card for one trend.
 * @param {import('../sessions/trends.js').Trend} trend
 */
export function trendCardHtml(trend) {
  const { points, max } = place(trend);
  const facts = describeTrend(trend.points);
  const first = points[0];
  const last = points[points.length - 1];
  const summary = `latest ${amount(facts.latest, trend.unit)}, lowest ${amount(facts.lowest, trend.unit)}, highest ${amount(facts.highest, trend.unit)}`;
  const gridY = [0, 0.5, 1].map((fraction) => PLOT.top + PLOT_H * (1 - fraction));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`).join(' ');
  const notes = [trend.note];
  if (trend.points.length >= TREND_LIMIT) notes.push(`Only the latest ${TREND_LIMIT} are drawn.`);
  if (trend.left > 0) notes.push(`${sessionsWord(trend.left)} without ${trend.key === 'group' ? 'two scored hits' : 'a target calibration'} ${trend.left === 1 ? 'is' : 'are'} not in this chart.`);

  return `
    <section class="card trend" data-trend="${trend.key}">
      <div class="card__head"><h2 class="card__title">${trend.title}</h2><span class="trend__count">${sessionsWord(points.length)}</span></div>
      <p class="trend__headline"><strong>${amount(facts.latest, trend.unit)}</strong><span>latest · lowest ${amount(facts.lowest, trend.unit)} · highest ${amount(facts.highest, trend.unit)}</span></p>
      <div class="trend__plot" tabindex="0" role="group" aria-label="${trend.title} chart, oldest session on the left. The left and right arrow keys step through the sessions.">
        <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${trend.title} over ${sessionsWord(points.length)}: ${summary}.">
          ${gridY.map((y) => `<line class="trend__grid" x1="${PLOT.left}" x2="${WIDTH - PLOT.right}" y1="${y}" y2="${y}"/>`).join('')}
          <text class="trend__axis" x="${PLOT.left - 8}" y="${gridY[2] + 4}" text-anchor="end">${max}</text>
          <text class="trend__axis" x="${PLOT.left - 8}" y="${gridY[0] + 4}" text-anchor="end">0</text>
          <text class="trend__axis" x="${PLOT.left}" y="${HEIGHT - 5}" text-anchor="start">${shortDate(first.startedAt)}</text>
          <text class="trend__axis" x="${WIDTH - PLOT.right}" y="${HEIGHT - 5}" text-anchor="end">${shortDate(last.startedAt)}</text>
          <line class="trend__cross" x1="${last.cx.toFixed(1)}" x2="${last.cx.toFixed(1)}" y1="${PLOT.top}" y2="${PLOT.top + PLOT_H}"/>
          <path class="trend__line" d="${path}"/>
          ${points.map((p) => `<circle class="trend__dot" cx="${p.cx.toFixed(1)}" cy="${p.cy.toFixed(1)}" r="${DOT_R}"/>`).join('')}
        </svg>
      </div>
      <p class="trend__readout" aria-live="polite"></p>
      <p class="fine-print">${notes.join(' ')}</p>
    </section>`;
}

/**
 * Makes the charts inside `container` respond: pointing at, touching or
 * arrowing along a plot picks the nearest session and names it under the plot,
 * with a link to that session.
 * @param {Element} container
 * @param {import('../sessions/trends.js').Trend[]} trends
 */
export function attachTrendCharts(container, trends) {
  for (const trend of trends) {
    const card = container.querySelector(`.trend[data-trend="${trend.key}"]`);
    if (!card) continue;
    const { points, step } = place(trend);
    const plot = card.querySelector('.trend__plot');
    const svg = card.querySelector('svg');
    const cross = card.querySelector('.trend__cross');
    const dots = [...card.querySelectorAll('.trend__dot')];
    const readout = card.querySelector('.trend__readout');
    let selected = -1;

    const select = (index) => {
      const i = Math.min(points.length - 1, Math.max(0, index));
      if (i === selected) return;
      selected = i;
      const point = points[i];
      cross.setAttribute('x1', point.cx.toFixed(1));
      cross.setAttribute('x2', point.cx.toFixed(1));
      dots.forEach((dot, n) => {
        dot.setAttribute('r', String(n === i ? DOT_R_SELECTED : DOT_R));
        dot.classList.toggle('is-selected', n === i);
      });
      readout.innerHTML = `<a href="#/history/${encodeURIComponent(point.id)}"></a>: <strong></strong>`;
      readout.querySelector('a').textContent = formatWhen(point.startedAt);
      readout.querySelector('strong').textContent = amount(point.value, trend.unit);
    };

    const nearest = (event) => {
      const box = svg.getBoundingClientRect();
      if (!box.width) return;
      const x = ((event.clientX - box.left) / box.width) * WIDTH;
      select(step > 0 ? Math.round((x - PLOT.left) / step) : 0);
    };

    plot.addEventListener('pointerdown', nearest);
    plot.addEventListener('pointermove', nearest);
    plot.addEventListener('keydown', (event) => {
      const move = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      if (!move && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      select(event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : selected + move);
    });

    select(points.length - 1);
  }
}
