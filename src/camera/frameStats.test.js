import { describe, expect, it } from 'vitest';
import { createFrameStats, percentile, summarize } from './frameStats.js';

/** Feeds frames at fixed spacing; returns the stats object. */
function feed(stats, { count, intervalMs, startFrame = 1 }) {
  for (let i = 0; i < count; i++) {
    stats.push({ now: i * intervalMs, mediaTime: (i * intervalMs) / 1000, presentedFrames: startFrame + i, processMs: 1 });
  }
  return stats;
}

describe('summarize', () => {
  it('returns null for no samples', () => {
    expect(summarize([])).toBeNull();
  });

  it('computes mean, min, median, p95 and max', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(summarize(values)).toEqual({ count: 100, mean: 50.5, min: 1, median: 50, p95: 95, max: 100 });
  });

  it('uses nearest-rank percentiles', () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(20);
    expect(percentile([10, 20, 30, 40], 1)).toBe(40);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe('createFrameStats', () => {
  it('reports nothing measurable before two frames arrive', () => {
    const stats = createFrameStats();
    stats.push({ now: 0 });
    const snap = stats.snapshot();
    expect(snap.frames).toBe(1);
    expect(snap.observedFps).toBeNull();
    expect(snap.callbackIntervalMs).toBeNull();
  });

  it('measures a steady 30 fps stream', () => {
    const snap = feed(createFrameStats(), { count: 31, intervalMs: 1000 / 30 }).snapshot();
    expect(snap.frames).toBe(31);
    expect(snap.observedFps).toBeCloseTo(30, 6);
    expect(snap.callbackIntervalMs.mean).toBeCloseTo(33.333, 2);
    expect(snap.mediaIntervalMs.mean).toBeCloseTo(33.333, 2);
    expect(snap.missedFrames).toBe(0);
    expect(snap.longIntervals).toBe(0);
    expect(snap.processMs.mean).toBe(1);
  });

  it('counts frames the browser presented but the callback never saw', () => {
    const stats = createFrameStats();
    stats.push({ now: 0, presentedFrames: 10 });
    stats.push({ now: 33, presentedFrames: 11 });
    stats.push({ now: 133, presentedFrames: 14 }); // 12 and 13 were skipped
    stats.push({ now: 166, presentedFrames: 15 });
    const snap = stats.snapshot();
    expect(snap.missedFrames).toBe(2);
    expect(snap.longIntervals).toBe(1);
    expect(snap.callbackIntervalMs.max).toBe(100);
  });

  it('reports missedFrames as null when presentedFrames is unavailable', () => {
    const stats = createFrameStats();
    stats.push({ now: 0 });
    stats.push({ now: 33 });
    expect(stats.snapshot().missedFrames).toBeNull();
  });

  it('ignores media time that does not advance', () => {
    const stats = createFrameStats();
    stats.push({ now: 0, mediaTime: 0 });
    stats.push({ now: 33, mediaTime: 0 });
    expect(stats.snapshot().mediaIntervalMs).toBeNull();
  });

  it('keeps only the most recent window of intervals but counts all frames', () => {
    const snap = feed(createFrameStats({ windowSize: 10 }), { count: 50, intervalMs: 20 }).snapshot();
    expect(snap.frames).toBe(50);
    expect(snap.recentIntervalsMs).toHaveLength(10);
    expect(snap.callbackIntervalMs.count).toBe(10);
  });
});
