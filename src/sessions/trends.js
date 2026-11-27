import { summarizeSession } from './metrics.js';

// The numbers behind History's trend charts: one value per saved session,
// oldest first.
//
// Rules, so a chart never says more than the sessions do:
// - Simulated sessions (the test pattern) are left out of every chart.
// - Accuracy and group size use scored sessions only, since only those have
//   ring scores and positions on the target.
// - A chart needs at least two sessions; one point is not a trend.
// - Only the most recent sessions are drawn (TREND_LIMIT), so the chart stays
//   readable on a phone.

export const TREND_LIMIT = 20;
export const MIN_TREND_POINTS = 2;

/**
 * @typedef {object} TrendPoint
 * @property {string} id         the session's id
 * @property {string} startedAt  ISO time
 * @property {number} value
 */

/**
 * @typedef {object} Trend
 * @property {'hits' | 'accuracy' | 'group'} key
 * @property {string} title
 * @property {string} unit        text placed after a value, e.g. "%" or " mm"
 * @property {string} note        what the number means, in plain words
 * @property {number | null} fixedMax  top of the scale when it is fixed (100 for a percentage)
 * @property {TrendPoint[]} points  oldest first
 * @property {number} left        real sessions that could not be used for this chart
 */

const byStart = (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt);

/**
 * @param {import('./metrics.js').SessionRecord[]} sessions in any order
 * @param {{ limit?: number }} [options]
 * @returns {{ trends: Trend[], simulatedLeftOut: number }} only charts with enough points
 */
export function buildTrends(sessions, { limit = TREND_LIMIT } = {}) {
  const real = sessions.filter((session) => !session.simulated).sort(byStart);
  const rows = real.map((session) => ({ session, summary: summarizeSession(session) }));
  const scored = rows.filter((row) => row.summary.scored);
  const point = (row, value) => ({ id: row.session.id, startedAt: row.session.startedAt, value });
  const recent = (points) => points.slice(-limit);

  /** @type {Trend[]} */
  const all = [
    {
      key: 'accuracy',
      title: 'Accuracy',
      unit: '%',
      note: 'Points scored out of the points possible for the hits that were detected. Higher is better.',
      fixedMax: 100,
      points: recent(scored.filter((row) => row.summary.accuracyPct !== null).map((row) => point(row, row.summary.accuracyPct))),
      left: real.length - scored.length,
    },
    {
      key: 'group',
      title: 'Group size',
      unit: ' mm',
      note: 'Widest distance between two hits, if the target was printed at full size. Smaller is tighter.',
      fixedMax: null,
      points: recent(scored.filter((row) => row.summary.groupMm !== null).map((row) => point(row, Math.round(row.summary.groupMm)))),
      left: real.length - scored.filter((row) => row.summary.groupMm !== null).length,
    },
    {
      key: 'hits',
      title: 'Hits per session',
      unit: '',
      note: 'How many hits each session detected. This follows how long you practised, not how well.',
      fixedMax: null,
      points: recent(rows.map((row) => point(row, row.summary.hits))),
      left: 0,
    },
  ];
  return { trends: all.filter((trend) => trend.points.length >= MIN_TREND_POINTS), simulatedLeftOut: sessions.length - real.length };
}

/**
 * A round number at or above `value` for the top of a chart: 1, 2 or 5 times
 * a power of ten.
 */
export function niceMax(value) {
  if (!(value > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const lead = value / power;
  return [1, 2, 5, 10].find((candidate) => lead <= candidate + 1e-9) * power;
}

/**
 * Where each point goes in a plot of the given size. The scale always starts
 * at zero. Points are spread evenly in session order, not by date, so a long
 * gap between sessions does not squash the rest.
 * @param {TrendPoint[]} points
 * @param {{ width: number, height: number, fixedMax?: number | null }} box the plot area
 */
export function layoutTrend(points, { width, height, fixedMax = null }) {
  const max = fixedMax ?? niceMax(Math.max(...points.map((p) => p.value)));
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  return {
    max,
    step,
    points: points.map((p, i) => ({
      ...p,
      px: points.length > 1 ? i * step : width / 2,
      py: height - (Math.min(Math.max(p.value, 0), max) / max) * height,
    })),
  };
}

/** Lowest, highest and latest values, for the chart's words. */
export function describeTrend(points) {
  const values = points.map((p) => p.value);
  return { count: values.length, latest: values[values.length - 1], lowest: Math.min(...values), highest: Math.max(...values) };
}
