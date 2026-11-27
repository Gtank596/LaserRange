import { describe, expect, it } from 'vitest';
import { createSessionClock } from './clock.js';
import { buildTrends, describeTrend, layoutTrend, niceMax } from './trends.js';

const hit = (targetX, targetY, score) => ({ tMs: 0, x: 0.5, y: 0.5, targetX, targetY, score, confidence: 1, frames: 1 });
const plainHit = () => ({ tMs: 0, x: 0.5, y: 0.5, confidence: 1, frames: 1 });

let counter = 0;
/** A saved session on the given day of November 2026. */
const session = (day, overrides = {}) => ({
  id: `s${++counter}`,
  schema: 1,
  startedAt: `2026-11-${String(day).padStart(2, '0')}T20:00:00.000Z`,
  endedAt: `2026-11-${String(day).padStart(2, '0')}T20:01:00.000Z`,
  durationMs: 60000,
  source: 'environment',
  simulated: false,
  scored: true,
  targetId: 'lr-10',
  settings: { redDelta: 60, dotLimit: 'normal' },
  build: 'test',
  hits: [hit(0, 0, 10), hit(0.25, 0, 8)],
  ...overrides,
});
const unscored = (day, hits) => session(day, { scored: false, targetId: null, hits: Array.from({ length: hits }, plainHit) });

const trendFor = (result, key) => result.trends.find((trend) => trend.key === key);

describe('buildTrends', () => {
  it('puts sessions oldest first whatever order they arrive in', () => {
    const result = buildTrends([unscored(27, 5), unscored(25, 3), unscored(26, 4)]);
    expect(trendFor(result, 'hits').points.map((p) => p.value)).toEqual([3, 4, 5]);
  });

  it('leaves simulated sessions out of every chart and says how many', () => {
    const result = buildTrends([unscored(25, 3), unscored(26, 4), session(27, { simulated: true, source: 'synthetic' })]);
    expect(result.simulatedLeftOut).toBe(1);
    expect(trendFor(result, 'hits').points).toHaveLength(2);
    expect(trendFor(result, 'accuracy')).toBeUndefined();
  });

  it('uses only scored sessions for accuracy and group size', () => {
    const result = buildTrends([session(24), unscored(25, 9), session(26, { hits: [hit(0, 0, 10), hit(0.5, 0, 6)] })]);
    const accuracy = trendFor(result, 'accuracy');
    expect(accuracy.points.map((p) => p.value)).toEqual([90, 80]);
    expect(accuracy.left).toBe(1);
    // 0.25 and 0.5 of an 80 mm outer ring radius
    expect(trendFor(result, 'group').points.map((p) => p.value)).toEqual([20, 40]);
    expect(trendFor(result, 'hits').points.map((p) => p.value)).toEqual([2, 9, 2]);
  });

  it('draws no chart from a single session: one point is not a trend', () => {
    expect(buildTrends([session(24)]).trends).toEqual([]);
    expect(buildTrends([]).trends).toEqual([]);
  });

  it('leaves a scored session with one hit out of group size only', () => {
    const result = buildTrends([session(24), session(25), session(26, { hits: [hit(0, 0, 10)] })]);
    expect(trendFor(result, 'accuracy').points).toHaveLength(3);
    const group = trendFor(result, 'group');
    expect(group.points).toHaveLength(2);
    expect(group.left).toBe(1);
  });

  it('keeps only the most recent sessions', () => {
    const many = Array.from({ length: 25 }, (_, i) => unscored(i + 1, i + 1));
    const points = trendFor(buildTrends(many), 'hits').points;
    expect(points).toHaveLength(20);
    expect(points[0].value).toBe(6);
    expect(points[19].value).toBe(25);
  });

  it('keeps each point tied to its session', () => {
    const first = unscored(25, 3);
    const result = buildTrends([first, unscored(26, 4)]);
    expect(trendFor(result, 'hits').points[0]).toEqual({ id: first.id, startedAt: first.startedAt, value: 3 });
  });
});

describe('niceMax', () => {
  it('rounds up to 1, 2 or 5 times a power of ten', () => {
    expect([1, 2, 3, 7, 10, 11, 45, 123, 500, 501].map(niceMax)).toEqual([1, 2, 5, 10, 10, 20, 50, 200, 500, 1000]);
  });

  it('never returns zero', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(Number.NaN)).toBe(1);
  });
});

describe('layoutTrend', () => {
  const points = [3, 4, 5].map((value, i) => ({ id: `p${i}`, startedAt: '2026-11-27T20:00:00.000Z', value }));

  it('spreads points evenly from the left edge to the right edge', () => {
    const layout = layoutTrend(points, { width: 200, height: 100 });
    expect(layout.points.map((p) => p.px)).toEqual([0, 100, 200]);
  });

  it('starts the scale at zero, with bigger values higher up', () => {
    const layout = layoutTrend(points, { width: 200, height: 100 });
    expect(layout.max).toBe(5);
    expect(layout.points.map((p) => p.py)).toEqual([40, 20, 0]);
  });

  it('uses a fixed top when given one, and keeps points inside the plot', () => {
    const layout = layoutTrend([{ ...points[0], value: 50 }, { ...points[1], value: 130 }], { width: 200, height: 100, fixedMax: 100 });
    expect(layout.max).toBe(100);
    expect(layout.points.map((p) => p.py)).toEqual([50, 0]);
  });
});

describe('describeTrend', () => {
  it('gives the count, latest, lowest and highest', () => {
    expect(describeTrend([{ value: 4 }, { value: 9 }, { value: 6 }])).toEqual({ count: 3, latest: 6, lowest: 4, highest: 9 });
  });
});

describe('the session clock', () => {
  it('reads zero before it starts and counts from the start', () => {
    const clock = createSessionClock();
    expect(clock.elapsed(500)).toBe(0);
    clock.start(1000);
    expect(clock.started).toBe(true);
    expect(clock.elapsed(4000)).toBe(3000);
  });

  it('stands still while paused and carries on after', () => {
    const clock = createSessionClock();
    clock.start(1000);
    clock.pause(3000);
    expect(clock.paused).toBe(true);
    expect(clock.elapsed(9000)).toBe(2000);
    expect(clock.pausedMs(9000)).toBe(6000);
    clock.resume(10000);
    expect(clock.paused).toBe(false);
    expect(clock.elapsed(11000)).toBe(3000);
    expect(clock.pausedMs(11000)).toBe(7000);
  });

  it('adds up several pauses', () => {
    const clock = createSessionClock();
    clock.start(0);
    clock.pause(1000);
    clock.resume(2000);
    clock.pause(3000);
    clock.resume(6000);
    expect(clock.elapsed(7000)).toBe(3000);
    expect(clock.pausedMs(7000)).toBe(4000);
  });

  it('still times a moment from just before the pause correctly', () => {
    // A flash seen at 2900 is reported when the session is paused at 3000.
    const clock = createSessionClock();
    clock.start(1000);
    clock.pause(3000);
    expect(clock.elapsed(2900)).toBe(1900);
  });

  it('ignores a second start, a second pause, and a resume when not paused', () => {
    const clock = createSessionClock();
    clock.start(1000);
    clock.start(5000);
    clock.resume(2000);
    clock.pause(3000);
    clock.pause(4000);
    clock.resume(5000);
    expect(clock.elapsed(6000)).toBe(3000);
    expect(clock.pausedMs(6000)).toBe(2000);
  });

  it('cannot be paused before it has started', () => {
    const clock = createSessionClock();
    clock.pause(500);
    expect(clock.paused).toBe(false);
    clock.start(1000);
    expect(clock.elapsed(1500)).toBe(500);
  });
});
