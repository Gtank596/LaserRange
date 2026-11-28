import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { getTarget } from '../calibration/targets.js';
import { describeFlashLengths, flashLengths, groupSizeMm, isSessionRecord, newSessionId, summarizeSession } from './metrics.js';
import { openSessionStore, SCHEMA_VERSION, upgradeSchema } from './store.js';

const target = getTarget('lr-10'); // outer ring radius 80 mm, 10 rings

const hit = (targetX, targetY, score, tMs = 0) => ({ tMs, x: 0.5, y: 0.5, targetX, targetY, score, confidence: 1, frames: 1 });

const session = (overrides = {}) => ({
  id: 'a',
  schema: 1,
  startedAt: '2026-11-27T20:00:00.000Z',
  endedAt: '2026-11-27T20:01:00.000Z',
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

describe('groupSizeMm', () => {
  it('is the widest distance between any two hits, in millimetres', () => {
    // 0.5 of the outer radius apart = 40 mm; the third hit is closer to both.
    expect(groupSizeMm([hit(0, 0), hit(0.5, 0), hit(0.2, 0.1)], target)).toBeCloseTo(40, 6);
    expect(groupSizeMm([hit(-0.3, -0.4), hit(0.3, 0.4)], target)).toBeCloseTo(80, 6);
  });

  it('needs two hits', () => {
    expect(groupSizeMm([], target)).toBeNull();
    expect(groupSizeMm([hit(0.1, 0.1)], target)).toBeNull();
  });
});

describe('summarizeSession', () => {
  it('totals a scored session', () => {
    const summary = summarizeSession(session({ hits: [hit(0, 0, 10), hit(0.25, 0, 8), hit(1.4, 0, 0)] }));
    expect(summary).toMatchObject({ hits: 3, scored: true, score: 18, maxScore: 30, accuracyPct: 60, onTarget: 2 });
    expect(summary.groupMm).toBeCloseTo(1.4 * 80, 6);
  });

  it('claims no score, accuracy or group size for a session without a calibration', () => {
    const summary = summarizeSession(session({ scored: false, targetId: null, hits: [{ tMs: 0, x: 0.2, y: 0.3, confidence: 1, frames: 1 }] }));
    expect(summary).toEqual({ hits: 1, scored: false, score: null, maxScore: null, accuracyPct: null, groupMm: null, onTarget: null });
  });

  it('handles a scored session with no hits', () => {
    expect(summarizeSession(session({ hits: [] }))).toMatchObject({ hits: 0, score: 0, accuracyPct: null, groupMm: null });
  });
});

describe('session records', () => {
  it('gives ids that differ and sort by time', () => {
    const early = newSessionId(1000, () => 0.5);
    const late = newSessionId(2000000000000, () => 0.5);
    expect(early).not.toBe(late);
    expect(newSessionId(5000, () => 0.1)).not.toBe(newSessionId(5000, () => 0.9));
    expect(newSessionId(1764273600000) < newSessionId(1764273600000 + 86400000)).toBe(true);
  });

  it('recognises a usable record and refuses damaged ones', () => {
    expect(isSessionRecord(session())).toBe(true);
    expect(isSessionRecord(null)).toBe(false);
    expect(isSessionRecord({ ...session(), startedAt: 'yesterday' })).toBe(false);
    expect(isSessionRecord({ ...session(), hits: 'none' })).toBe(false);
    expect(isSessionRecord({ ...session(), hits: [{ x: 0.5 }] })).toBe(false);
  });
});

describe('session store (IndexedDB)', () => {
  const open = (factory = new IDBFactory()) => openSessionStore(factory, 'test');

  it('saves a session and reads it back unchanged', async () => {
    const store = await open();
    await store.save(session());
    expect(await store.get('a')).toEqual(session());
    expect(await store.get('missing')).toBeNull();
  });

  it('lists newest first and honours a limit', async () => {
    const store = await open();
    await store.save(session({ id: 'old', startedAt: '2026-11-01T10:00:00.000Z' }));
    await store.save(session({ id: 'new', startedAt: '2026-11-27T10:00:00.000Z' }));
    await store.save(session({ id: 'mid', startedAt: '2026-11-15T10:00:00.000Z' }));
    expect((await store.list()).map((item) => item.id)).toEqual(['new', 'mid', 'old']);
    expect((await store.list({ limit: 1 })).map((item) => item.id)).toEqual(['new']);
  });

  it('replaces a session saved again with the same id, and removes one', async () => {
    const store = await open();
    await store.save(session());
    await store.save(session({ hits: [hit(0, 0, 10)] }));
    expect((await store.list())[0].hits).toHaveLength(1);
    await store.remove('a');
    expect(await store.list()).toEqual([]);
  });

  it('refuses to save something that is not a session', async () => {
    const store = await open();
    await expect(store.save({ id: 'x' })).rejects.toThrow('Not a valid session');
  });

  it('keeps sessions when the database is closed and opened again', async () => {
    const factory = new IDBFactory();
    const first = await open(factory);
    await first.save(session());
    first.close();
    const second = await open(factory);
    expect((await second.list()).map((item) => item.id)).toEqual(['a']);
  });

  it('skips a damaged record instead of failing the whole list', async () => {
    const factory = new IDBFactory();
    const store = await open(factory);
    await store.save(session());
    store.close();
    // Write a broken record behind the store's back.
    const db = await new Promise((resolve, reject) => {
      const request = factory.open('test', SCHEMA_VERSION);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put({ id: 'broken', startedAt: '2026-11-28T10:00:00.000Z', hits: null });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const again = await open(factory);
    expect((await again.list()).map((item) => item.id)).toEqual(['a']);
    expect(await again.get('broken')).toBeNull();
  });

  it('builds the schema from nothing: a sessions store with a start-time index', async () => {
    const factory = new IDBFactory();
    const db = await new Promise((resolve, reject) => {
      const request = factory.open('schema', SCHEMA_VERSION);
      request.onupgradeneeded = (event) => upgradeSchema(request.result, event.oldVersion);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect([...db.objectStoreNames]).toEqual(['sessions']);
    const sessions = db.transaction('sessions').objectStore('sessions');
    expect(sessions.keyPath).toBe('id');
    expect([...sessions.indexNames]).toEqual(['startedAt']);
    db.close();
  });
});

describe('throws a clear error without a database', () => {
  it('when the browser has none', async () => {
    await expect(openSessionStore(null)).rejects.toThrow('no on-device database');
  });
});

describe('flashLengths', () => {
  it('gives the shortest, middle and longest lit time', () => {
    const lengths = flashLengths([{ durationMs: 385 }, { durationMs: 50 }, { durationMs: 185 }]);
    expect(lengths).toEqual({ count: 3, minMs: 50, medianMs: 185, maxMs: 385 });
    expect(describeFlashLengths(lengths)).toBe('50 to 385 ms, typically 185 ms');
  });

  it('takes the middle of an even number as halfway between the two middle ones', () => {
    expect(flashLengths([{ durationMs: 100 }, { durationMs: 200 }]).medianMs).toBe(150);
  });

  it('leaves out hits saved before lengths were kept, and is null when none has one', () => {
    expect(flashLengths([{ frames: 3 }, { durationMs: 33 }])).toMatchObject({ count: 1, minMs: 33 });
    expect(flashLengths([{ frames: 3 }])).toBeNull();
    expect(flashLengths([])).toBeNull();
    expect(describeFlashLengths(null)).toBe('');
  });

  it('describes flashes seen in a single frame without calling them 0 ms long', () => {
    expect(describeFlashLengths(flashLengths([{ durationMs: 0 }, { durationMs: 0 }]))).toBe('one video frame each');
    expect(describeFlashLengths(flashLengths([{ durationMs: 0 }, { durationMs: 17 }, { durationMs: 33 }]))).toBe('one frame to 35 ms, typically 15 ms');
    expect(describeFlashLengths(flashLengths([{ durationMs: 17 }, { durationMs: 17 }]))).toBe('about 15 ms');
  });
});
