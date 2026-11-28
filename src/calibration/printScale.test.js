import { describe, expect, it } from 'vitest';
import { groupSizeMm, summarizeSession } from '../sessions/metrics.js';
import {
  barMmFromMeasurement,
  clearBarMm,
  loadBarEntry,
  loadBarMm,
  loadPrintScale,
  parseBarMm,
  parseLength,
  printScaleFromBar,
  safePrintScale,
  saveBarMm,
} from './printScale.js';
import { getTarget } from './targets.js';

function fakeStorage() {
  const items = new Map();
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

describe('parseBarMm', () => {
  it('reads a ruler measurement, with a point or a comma', () => {
    expect(parseBarMm('47.5')).toBe(47.5);
    expect(parseBarMm(' 47,5 ')).toBe(47.5);
    expect(parseBarMm(50)).toBe(50);
  });

  it('keeps one decimal place: a ruler reads no finer', () => {
    expect(parseBarMm('47.449')).toBe(47.4);
  });

  it('refuses anything that cannot be a print scale', () => {
    for (const bad of ['', 'abc', '0', '-5', '4.75', '475', 'NaN']) expect(parseBarMm(bad)).toBeNull();
  });
});

describe('parseLength', () => {
  it('reads decimals with a point or a comma, with or without a unit', () => {
    expect(parseLength('49.2')).toBe(49.2);
    expect(parseLength('49,2 mm')).toBe(49.2);
    expect(parseLength('1.94 in')).toBe(1.94);
    expect(parseLength('.5')).toBe(0.5);
  });

  it('reads inch fractions the way they are written off a ruler', () => {
    expect(parseLength('1 15/16')).toBeCloseTo(1.9375, 10);
    expect(parseLength('1-15/16"')).toBeCloseTo(1.9375, 10);
    expect(parseLength('7 1/16 inches')).toBeCloseTo(7.0625, 10);
    expect(parseLength('15/16')).toBeCloseTo(0.9375, 10);
  });

  it('refuses what is not a length', () => {
    for (const bad of ['', 'abc', '1/0', '1 2', '-3', '1.2.3', null, undefined]) expect(parseLength(bad)).toBeNull();
  });
});

describe('barMmFromMeasurement', () => {
  it('takes the bar in millimetres as it is', () => {
    expect(barMmFromMeasurement('47.5')).toBe(47.5);
  });

  it('converts the bar measured in inches', () => {
    // 1 15/16 in = 49.2 mm
    expect(barMmFromMeasurement('1 15/16', { unit: 'in' })).toBe(49.2);
  });

  it('scales a measurement of the 180 mm square down to the 50 mm bar', () => {
    expect(barMmFromMeasurement('180', { fullSizeMm: 180 })).toBe(50);
    expect(barMmFromMeasurement('171', { fullSizeMm: 180 })).toBe(47.5);
    // 7 1/16 in = 179.4 mm, which is 99.7% of 180
    expect(barMmFromMeasurement('7 1/16', { unit: 'in', fullSizeMm: 180 })).toBe(49.8);
  });

  it('refuses a length that cannot be this sheet, such as inches entered as millimetres', () => {
    expect(barMmFromMeasurement('1 15/16')).toBeNull();
    expect(barMmFromMeasurement('49.2', { unit: 'in' })).toBeNull();
    expect(barMmFromMeasurement('abc', { unit: 'in' })).toBeNull();
  });
});

describe('print scale', () => {
  it('is the measured bar over 50 mm', () => {
    expect(printScaleFromBar(47.5)).toBeCloseTo(0.95, 10);
    expect(printScaleFromBar(47.6)).toBe(0.952);
    expect(printScaleFromBar(50)).toBe(1);
  });

  it('is 1 when there is no usable measurement', () => {
    expect(printScaleFromBar(null)).toBe(1);
    expect(printScaleFromBar('nonsense')).toBe(1);
  });

  it('is 1 for a damaged value in a saved session', () => {
    expect(safePrintScale(0.95)).toBe(0.95);
    for (const bad of [undefined, null, Number.NaN, 0, -1, 9]) expect(safePrintScale(bad)).toBe(1);
  });
});

describe('the saved bar measurement', () => {
  it('is absent on a fresh device, so the scale is 1', () => {
    const storage = fakeStorage();
    expect(loadBarMm(storage)).toBeNull();
    expect(loadPrintScale(storage)).toBe(1);
  });

  it('is saved, read back and cleared', () => {
    const storage = fakeStorage();
    expect(saveBarMm('47.5', storage)).toBe(true);
    expect(loadBarMm(storage)).toBe(47.5);
    expect(loadPrintScale(storage)).toBeCloseTo(0.95, 10);
    clearBarMm(storage);
    expect(loadBarMm(storage)).toBeNull();
  });

  it('keeps what was typed, for showing it back', () => {
    const storage = fakeStorage();
    expect(loadBarEntry(storage)).toBeNull();
    saveBarMm(49.2, storage, new Date(), { text: '1 15/16', unit: 'in', of: 'bar' });
    expect(loadBarMm(storage)).toBe(49.2);
    expect(loadBarEntry(storage)).toEqual({ text: '1 15/16', unit: 'in', of: 'bar' });
    saveBarMm(47.5, storage);
    expect(loadBarEntry(storage)).toBeNull();
  });

  it('does not save an unusable measurement', () => {
    const storage = fakeStorage();
    expect(saveBarMm('abc', storage)).toBe(false);
    expect(storage.items.size).toBe(0);
  });

  it('treats a damaged record as absent, and reports a refusal to store', () => {
    const storage = fakeStorage();
    storage.items.set('laserrange.print.v1', '{broken');
    expect(loadBarMm(storage)).toBeNull();
    const refusing = {
      setItem() {
        throw new Error('blocked');
      },
    };
    expect(saveBarMm(47.5, refusing)).toBe(false);
    expect(saveBarMm(47.5, null)).toBe(false);
  });
});

describe('millimetres follow the print scale; scores do not', () => {
  const target = getTarget('lr-10'); // outer ring radius 80 mm at full size
  const hit = (targetX, targetY, score) => ({ tMs: 0, x: 0.5, y: 0.5, targetX, targetY, score, confidence: 1, frames: 1 });
  const hits = [hit(0, 0, 10), hit(0.5, 0, 6)];

  it('group size shrinks with the sheet', () => {
    expect(groupSizeMm(hits, target)).toBeCloseTo(40, 6);
    expect(groupSizeMm(hits, target, 0.95)).toBeCloseTo(38, 6);
  });

  it('a session run on a sheet printed at 95% reports 95% of the millimetres and the same score', () => {
    const full = summarizeSession({ hits, scored: true, targetId: 'lr-10' });
    const small = summarizeSession({ hits, scored: true, targetId: 'lr-10', printScale: 0.95 });
    expect(full.groupMm).toBeCloseTo(40, 6);
    expect(small.groupMm).toBeCloseTo(38, 6);
    expect(small.score).toBe(full.score);
    expect(small.accuracyPct).toBe(full.accuracyPct);
  });
});
