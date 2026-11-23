import { describe, expect, it } from 'vitest';
import { SAMPLE_HITS } from '../sessions/sampleData.js';
import { scoreHit, summarizeHits } from './scoring.js';

describe('scoreHit (10-ring target)', () => {
  it('scores the exact centre as 10', () => {
    expect(scoreHit({ x: 0, y: 0 })).toBe(10);
  });

  it('scores by distance from centre, in any direction', () => {
    expect(scoreHit({ x: 0.05, y: 0 })).toBe(10);
    expect(scoreHit({ x: 0, y: -0.15 })).toBe(9);
    expect(scoreHit({ x: -0.55, y: 0 })).toBe(5);
    expect(scoreHit({ x: 0.6, y: 0.6 })).toBe(2); // r ~ 0.849
    expect(scoreHit({ x: 0, y: 0.95 })).toBe(1);
  });

  it('gives a hit exactly on a ring line the higher score', () => {
    expect(scoreHit({ x: 0.1, y: 0 })).toBe(10);
    expect(scoreHit({ x: 0.3, y: 0 })).toBe(8); // 0.3 * 10 is 3.0000000000000004 in floating point
    expect(scoreHit({ x: 1, y: 0 })).toBe(1);
  });

  it('scores 0 outside the target or for invalid coordinates', () => {
    expect(scoreHit({ x: 1.01, y: 0 })).toBe(0);
    expect(scoreHit({ x: 0.8, y: 0.8 })).toBe(0);
    expect(scoreHit({ x: NaN, y: 0 })).toBe(0);
  });

  it('supports other ring counts', () => {
    const fiveRing = { id: 'five', name: 'Five ring', ringCount: 5 };
    expect(scoreHit({ x: 0, y: 0 }, fiveRing)).toBe(5);
    expect(scoreHit({ x: 0.5, y: 0 }, fiveRing)).toBe(3);
  });
});

describe('summarizeHits', () => {
  it('handles an empty session without dividing by zero', () => {
    expect(summarizeHits([])).toEqual({ hits: 0, score: 0, maxScore: 0, accuracyPct: null });
  });

  it('totals score and accuracy', () => {
    const summary = summarizeHits([{ x: 0, y: 0 }, { x: 0.45, y: 0 }, { x: 2, y: 2 }]);
    expect(summary).toEqual({ hits: 3, score: 16, maxScore: 30, accuracyPct: 53 });
  });

  it('keeps the dashboard sample data internally consistent', () => {
    const summary = summarizeHits(SAMPLE_HITS);
    expect(summary.hits).toBe(SAMPLE_HITS.length);
    expect(summary.score).toBe(SAMPLE_HITS.reduce((sum, hit) => sum + scoreHit(hit), 0));
    expect(summary.accuracyPct).toBeGreaterThan(0);
    expect(summary.accuracyPct).toBeLessThanOrEqual(100);
  });
});
