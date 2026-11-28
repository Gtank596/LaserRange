import { describe, expect, it } from 'vitest';
import { flashExposure, peakFlashExposure } from '../simulation/exposureModel.js';
import { createSceneRenderer, mulberry32 } from '../simulation/sceneSynth.js';
import { createBlobFinder } from './blobs.js';
import { createEventGrouper } from './eventGrouper.js';
import { matchEvents } from './matchEvents.js';
import { confidenceWord } from './params.js';
import { createFlashPipeline } from './pipeline.js';

const WIDTH = 160;
const HEIGHT = 120;
const FRAME_MS = 1000 / 60;

/**
 * Renders `frames` synthetic frames at 60 fps and runs them through the pipeline.
 * flashesFor(frameIndex) returns the flashes visible in that frame.
 */
function runSequence({ frames, flashesFor = () => [], objectsFor = () => [], brightnessFor = () => 0, params, seed = 7, noise = 6 }) {
  const render = createSceneRenderer({ width: WIDTH, height: HEIGHT, seed, noise });
  // No warm-up unless a test asks for one, so flashes can come early in a sequence.
  const pipeline = createFlashPipeline(WIDTH, HEIGHT, { warmupMs: 0, ...params });
  const events = [];
  const statuses = new Set();
  for (let i = 0; i < frames; i++) {
    const frame = render({ flashes: flashesFor(i), objects: objectsFor(i), brightness: brightnessFor(i) });
    const result = pipeline.process(frame, i * FRAME_MS);
    statuses.add(result.status);
    if (result.event) events.push(result.event);
  }
  const last = pipeline.flush();
  if (last) events.push(last);
  return { events, hits: events.filter((event) => event.accepted), statuses };
}

const dot = (overrides = {}) => ({ x: 0.3, y: 0.6, radius: 4, intensity: 1, ...overrides });

describe('createBlobFinder', () => {
  it('groups touching pixels (including diagonals) and separates distant ones', () => {
    const score = new Float32Array(8 * 4);
    const isRed = new Uint8Array(8 * 4);
    for (const i of [0, 9, 18]) score[i] = 10; // a diagonal run: (0,0) (1,1) (2,2)
    score[7] = 20; // far corner (7,0)
    isRed[7] = 1;
    const blobs = createBlobFinder(8, 4)(score, isRed);
    expect(blobs.map((blob) => blob.area).sort()).toEqual([1, 3]);
    const single = blobs.find((blob) => blob.area === 1);
    expect(single.redArea).toBe(1);
    expect(single.x).toBeCloseTo(7.5 / 8, 6);
    expect(single.y).toBeCloseTo(0.5 / 4, 6);
  });

  it('weights the centre towards stronger pixels', () => {
    const score = new Float32Array(4);
    score[0] = 10;
    score[1] = 30;
    const [blob] = createBlobFinder(4, 1)(score, new Uint8Array(4));
    expect(blob.x).toBeCloseTo((0.5 * 10 + 1.5 * 30) / 40 / 4, 6);
  });
});

describe('flash pipeline on synthetic frames', () => {
  it('reports nothing for 300 frames of sensor-like noise', () => {
    const { events, statuses } = runSequence({ frames: 300, noise: 8 });
    expect(events).toEqual([]);
    expect([...statuses].sort()).toEqual(['ok', 'warming']);
  });

  it('detects a single-frame flash and locates it within 1% of the frame', () => {
    const { hits } = runSequence({ frames: 60, flashesFor: (i) => (i === 30 ? [dot()] : []) });
    expect(hits).toHaveLength(1);
    expect(hits[0].frames).toBe(1);
    expect(Math.abs(hits[0].x - 0.3)).toBeLessThan(0.01);
    expect(Math.abs(hits[0].y - 0.6)).toBeLessThan(0.01);
    expect(hits[0].t).toBeCloseTo(30 * FRAME_MS, 6);
    expect(confidenceWord(hits[0].confidence)).toBe('strong');
  });

  it('reports one hit for a flash that spans several frames', () => {
    const { hits } = runSequence({ frames: 60, flashesFor: (i) => (i >= 30 && i <= 32 ? [dot()] : []) });
    expect(hits).toHaveLength(1);
    expect(hits[0].frames).toBe(3);
    expect(hits[0].durationMs).toBeCloseTo(2 * FRAME_MS, 6);
  });

  it('reports separate hits for flashes half a second apart', () => {
    const { hits } = runSequence({
      frames: 100,
      flashesFor: (i) => (i === 30 ? [dot()] : i === 60 ? [dot({ x: 0.7, y: 0.2 })] : []),
    });
    expect(hits.map((hit) => hit.index)).toEqual([1, 2]);
    expect(hits[1].x).toBeCloseTo(0.7, 1);
  });

  it('suppresses a second flash inside the cooldown window', () => {
    const { events, hits } = runSequence({ frames: 60, flashesFor: (i) => (i === 30 || i === 34 ? [dot()] : []) });
    expect(hits).toHaveLength(1);
    expect(events.filter((event) => !event.accepted).map((event) => event.reason)).toEqual(['cooldown']);
  });

  it('ignores a flash too dim to clear the threshold, and finds a half-strength one', () => {
    const dim = runSequence({ frames: 60, flashesFor: (i) => (i === 30 ? [dot({ intensity: 0.15 })] : []) });
    expect(dim.hits).toHaveLength(0);
    const half = runSequence({ frames: 60, flashesFor: (i) => (i === 30 ? [dot({ intensity: 0.5 })] : []) });
    expect(half.hits).toHaveLength(1);
    expect(half.hits[0].confidence).toBeLessThan(1);
  });

  it('finds a dot whose centre is blown out to white', () => {
    const { hits } = runSequence({ frames: 60, flashesFor: (i) => (i === 30 ? [dot({ radius: 6, core: true })] : []) });
    expect(hits).toHaveLength(1);
    expect(Math.abs(hits[0].x - 0.3)).toBeLessThan(0.01);
  });

  it('does not report a moderate lighting change', () => {
    const { events } = runSequence({ frames: 120, brightnessFor: (i) => (i >= 40 ? 40 : 0) });
    expect(events).toEqual([]);
  });

  it('treats the whole frame blowing out as a scene change, not a hit', () => {
    const { events, statuses } = runSequence({ frames: 120, brightnessFor: (i) => (i >= 40 && i < 43 ? 200 : 0) });
    expect(events).toEqual([]);
    expect(statuses.has('unstable')).toBe(true);
  });

  it('rejects a red object that stays in view, then recovers', () => {
    const { events, hits } = runSequence({
      frames: 220,
      flashesFor: (i) => {
        const flashes = [];
        if (i >= 30 && i < 150) flashes.push(dot()); // stays lit for two seconds
        if (i === 190) flashes.push(dot({ x: 0.8, y: 0.3 }));
        return flashes;
      },
    });
    expect(events.filter((event) => event.reason === 'persistent')).toHaveLength(1);
    expect(hits).toHaveLength(1);
    expect(hits[0].x).toBeCloseTo(0.8, 1);
  });

  describe('something reddish moving through view (like a hand)', () => {
    // A thin skin-toned bar sweeping across at 4 px per frame. Its leading
    // edge alone is small and red enough to pass for a spot.
    const sweep = (i) => (i >= 30 && i < 70 ? [{ x: (i - 30) * 4, y: 40, w: 4, h: 30, color: [230, 140, 120] }] : []);

    it('is not reported, and is recognised as movement', () => {
      const { hits, statuses } = runSequence({ frames: 100, objectsFor: sweep });
      expect(hits).toHaveLength(0);
      expect(statuses.has('motion')).toBe(true);
    });

    it('would be reported without the movement check (so the test above means something)', () => {
      const { hits } = runSequence({ frames: 100, objectsFor: sweep, params: { maxStrayFraction: 1 } });
      expect(hits.length).toBeGreaterThan(0);
    });

    it('does not stop a flash elsewhere from being found once the movement ends', () => {
      const { hits } = runSequence({
        frames: 120,
        objectsFor: sweep,
        flashesFor: (i) => (i === 90 ? [dot({ x: 0.7, y: 0.8 })] : []),
      });
      expect(hits).toHaveLength(1);
      expect(hits[0].x).toBeCloseTo(0.7, 1);
      expect(hits[0].stray).toBeLessThan(0.003);
    });
  });

  describe('with a target-area mask', () => {
    // Watch only the left half of the frame.
    const leftHalf = new Uint8Array(WIDTH * HEIGHT);
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH / 2; x++) leftHalf[y * WIDTH + x] = 1;

    const run = (flashesFor, objectsFor = () => []) => {
      const render = createSceneRenderer({ width: WIDTH, height: HEIGHT, seed: 3 });
      const pipeline = createFlashPipeline(WIDTH, HEIGHT, { warmupMs: 0 }, { mask: leftHalf });
      const hits = [];
      for (let i = 0; i < 80; i++) {
        const result = pipeline.process(render({ flashes: flashesFor(i), objects: objectsFor(i) }), i * FRAME_MS);
        if (result.event?.accepted) hits.push(result.event);
      }
      return hits;
    };

    it('finds a flash inside the watched area and ignores one outside it', () => {
      expect(run((i) => (i === 30 ? [dot({ x: 0.25 })] : []))).toHaveLength(1);
      expect(run((i) => (i === 30 ? [dot({ x: 0.75 })] : []))).toHaveLength(0);
    });

    it('is not disturbed by movement outside the watched area', () => {
      const moving = (i) => (i >= 20 && i < 60 ? [{ x: 90 + (i - 20), y: 20, w: 30, h: 60, color: [230, 140, 120] }] : []);
      expect(run((i) => (i === 30 ? [dot({ x: 0.25 })] : []), moving)).toHaveLength(1);
    });

    describe('when the watched target is a small part of the picture', () => {
      // A 40 x 40 pixel target: about 8% of the 160 x 120 picture.
      const smallTarget = new Uint8Array(WIDTH * HEIGHT);
      for (let y = 40; y < 80; y++) for (let x = 60; x < 100; x++) smallTarget[y * WIDTH + x] = 1;

      const runSmall = (flashesFor) => {
        const render = createSceneRenderer({ width: WIDTH, height: HEIGHT, seed: 3 });
        const pipeline = createFlashPipeline(WIDTH, HEIGHT, { warmupMs: 0 }, { mask: smallTarget });
        const hits = [];
        const statuses = new Set();
        for (let i = 0; i < 80; i++) {
          const result = pipeline.process(render({ flashes: flashesFor(i) }), i * FRAME_MS);
          statuses.add(result.status);
          if (result.event?.accepted) hits.push(result.event);
        }
        return { hits, statuses };
      };

      it('counts a flash that is small in the picture even though it fills a good share of the target', () => {
        // Seen on the phone, 2026-11-28: with a target found, every flash of the
        // LED was reported as "the picture changed" and none was counted. The
        // limits were being measured against the target's area, not the picture's.
        // Radius 6 is about 0.6% of the picture (inside the 1% dot limit) but 7% of this target.
        const { hits, statuses } = runSmall((i) => (i === 30 || i === 31 ? [dot({ x: 0.5, y: 0.5, radius: 6 })] : []));
        expect(statuses.has('unstable')).toBe(false);
        expect(statuses.has('large')).toBe(false);
        expect(hits).toHaveLength(1);
        expect(hits[0].x).toBeCloseTo(0.5, 1);
      });

      it('still refuses a lit area too big for the picture-wide dot limit', () => {
        // Radius 10 is about 1.6% of the picture: over the 1% limit, with or without a target.
        const { hits, statuses } = runSmall((i) => (i === 30 || i === 31 ? [dot({ x: 0.5, y: 0.5, radius: 10 })] : []));
        expect(hits).toHaveLength(0);
        expect(statuses.has('large')).toBe(true);
      });
    });
  });

  it('rejects a red region far larger than a laser dot, and says it was too large rather than movement', () => {
    // Radius 10 is about 1.6% of this frame: over the 1% dot limit, under the 3% "scene change" limit.
    const { hits, statuses } = runSequence({ frames: 60, flashesFor: (i) => (i === 30 ? [dot({ radius: 10 })] : []) });
    expect(hits).toHaveLength(0);
    expect(statuses.has('large')).toBe(true);
    expect(statuses.has('motion')).toBe(false);
  });

  it('reports a hit that grows too large as rejected for size', () => {
    // One frame of a small spot, then the lit area spreads (as a partly exposed first frame can).
    const { events } = runSequence({
      frames: 60,
      flashesFor: (i) => (i === 30 ? [dot()] : i > 30 && i < 36 ? [dot({ radius: 10 })] : []),
    });
    expect(events.map((event) => event.reason)).toEqual(['large']);
  });

  it('gets used to a large red area that stays, and finds a flash next to it afterwards', () => {
    const { hits, statuses } = runSequence({
      frames: 220,
      flashesFor: (i) => {
        const flashes = [];
        if (i >= 30) flashes.push(dot({ radius: 10 })); // appears and never leaves
        if (i === 190) flashes.push(dot({ x: 0.8, y: 0.3 }));
        return flashes;
      },
    });
    expect(statuses.has('large')).toBe(true);
    expect(hits).toHaveLength(1);
    expect(hits[0].x).toBeCloseTo(0.8, 1);
  });

  describe('the warm-up at the start of a run', () => {
    // Two seconds by default: 120 frames at 60 fps.
    const WARMUP = { warmupMs: 2000 };

    it('counts nothing during the warm-up and finds a flash after it', () => {
      const { events, hits, statuses } = runSequence({
        frames: 200,
        params: WARMUP,
        flashesFor: (i) => (i === 30 || (i >= 80 && i <= 85) ? [dot()] : i === 160 ? [dot({ x: 0.7, y: 0.2 })] : []),
      });
      expect(events).toHaveLength(1);
      expect(hits).toHaveLength(1);
      expect(hits[0].x).toBeCloseTo(0.7, 1);
      expect(hits[0].t).toBeCloseTo(160 * FRAME_MS, 6);
      expect(statuses.has('warming')).toBe(true);
    });

    it('reports every frame of the warm-up as warming, and none after it', () => {
      const render = createSceneRenderer({ width: WIDTH, height: HEIGHT, seed: 7 });
      const pipeline = createFlashPipeline(WIDTH, HEIGHT);
      const statuses = [];
      for (let i = 0; i < 150; i++) statuses.push(pipeline.process(render(), i * FRAME_MS).status);
      expect(statuses.slice(0, 120).every((status) => status === 'warming')).toBe(true);
      expect(statuses.slice(120).every((status) => status === 'ok')).toBe(true);
    });

    it('takes a red spot that appears during the warm-up and stays as part of the scene', () => {
      // What the real camera showed: a red spot at the unlit LED soon after starting.
      const stays = (i) => (i >= 20 ? [dot()] : []);
      const withWarmup = runSequence({
        frames: 240,
        params: WARMUP,
        flashesFor: (i) => [...stays(i), ...(i === 200 ? [dot({ x: 0.7, y: 0.2 })] : [])],
      });
      expect(withWarmup.events).toHaveLength(1);
      expect(withWarmup.hits).toHaveLength(1);
      expect(withWarmup.hits[0].x).toBeCloseTo(0.7, 1);
      // Without the warm-up the same spot is seen and rejected (so the test above means something).
      const without = runSequence({ frames: 240, flashesFor: stays });
      expect(without.events.map((event) => event.reason)).toEqual(['persistent']);
    });

    it('does not report a spot that is still lit when the warm-up ends', () => {
      const { events } = runSequence({ frames: 200, params: WARMUP, flashesFor: (i) => (i >= 115 && i <= 125 ? [dot()] : []) });
      expect(events).toEqual([]);
    });
  });

  describe('a flash that also lights up its surroundings', () => {
    // A red dot plus a wide, weak wash of light around it. The wash is not red
    // enough to be part of the spot but does change the brightness of far more
    // of the picture than the movement check allows.
    const lit = (from, to) => (i) => (i >= from && i <= to ? [{ ...dot(), radius: 16, intensity: 0.45, glow: true }, dot()] : []);

    it('is found, once, for a single frame and for a 100 ms flash', () => {
      const single = runSequence({ frames: 80, flashesFor: lit(30, 30) });
      expect(single.hits).toHaveLength(1);
      expect(single.statuses.has('motion')).toBe(false);
      const long = runSequence({ frames: 80, flashesFor: lit(30, 35) });
      expect(long.hits).toHaveLength(1);
      expect(long.hits[0].frames).toBe(6);
      expect(Math.abs(long.hits[0].x - 0.3)).toBeLessThan(0.01);
    });

    it('would be taken for movement if the glow were not allowed for (so the test above means something)', () => {
      const { hits, statuses } = runSequence({ frames: 80, flashesFor: lit(30, 35), params: { haloScale: 0, haloMin: 0 } });
      expect(hits).toHaveLength(0);
      expect(statuses.has('motion')).toBe(true);
    });
  });
});

describe('createEventGrouper', () => {
  const blob = (x, y) => ({ x, y, strength: 100, peak: 150, area: 10 });

  it('splits spots that are far apart into separate events', () => {
    const grouper = createEventGrouper({ cooldownMs: 0 });
    expect(grouper.push(0, blob(0.2, 0.2))).toBeNull();
    const first = grouper.push(17, blob(0.8, 0.8));
    expect(first.accepted).toBe(true);
    expect(first.x).toBeCloseTo(0.2, 6);
    expect(grouper.flush().x).toBeCloseTo(0.8, 6);
  });

  it('places a hit where the spot first appeared, not where it drifted to', () => {
    // Twelve frames, the spot moving 0.004 of the picture each frame.
    const grouper = createEventGrouper();
    for (let i = 0; i < 12; i++) grouper.push(i * FRAME_MS, blob(0.5 + i * 0.004, 0.5));
    const hit = grouper.flush();
    expect(hit.accepted).toBe(true);
    expect(hit.frames).toBe(12);
    // The first three frames (50 ms at 60 fps): 0.500, 0.504, 0.508.
    expect(hit.x).toBeCloseTo(0.504, 6);
    expect(hit.travel).toBeCloseTo(0.544 - 0.504, 6);
  });

  it('counts a spot that drifts a long way while lit as one hit', () => {
    // 0.01 of the picture per frame for 20 frames: three times the merge distance in all.
    const grouper = createEventGrouper();
    const events = [];
    for (let i = 0; i < 20; i++) {
      const event = grouper.push(i * FRAME_MS, blob(0.3 + i * 0.01, 0.4));
      if (event) events.push(event);
    }
    events.push(grouper.flush());
    expect(events).toHaveLength(1);
    expect(events[0].accepted).toBe(true);
    expect(events[0].x).toBeCloseTo(0.31, 6);
  });

  it('counts a flash lit for 0.6 s, and refuses one still lit after a second', () => {
    const lit = (frames) => {
      const grouper = createEventGrouper();
      const events = [];
      for (let i = 0; i < frames; i++) {
        const event = grouper.push(i * FRAME_MS, blob(0.5, 0.5));
        if (event) events.push(event);
      }
      for (let i = frames; i < frames + 6; i++) {
        const event = grouper.push(i * FRAME_MS, null);
        if (event) events.push(event);
      }
      return events;
    };
    const longFlash = lit(36);
    expect(longFlash).toHaveLength(1);
    expect(longFlash[0].accepted).toBe(true);
    expect(longFlash[0].durationMs).toBeCloseTo(35 * FRAME_MS, 6);
    expect(lit(70).map((event) => event.reason)).toEqual(['persistent']);
  });

  it('bridges a one-frame dropout inside the gap allowance', () => {
    const grouper = createEventGrouper();
    grouper.push(0, blob(0.5, 0.5));
    expect(grouper.push(17, null)).toBeNull();
    grouper.push(33, blob(0.5, 0.5));
    expect(grouper.flush().frames).toBe(2);
  });
});

describe('matchEvents', () => {
  it('pairs detections with flashes and counts misses and extras', () => {
    const emitted = [
      { t: 1000, x: 0.3, y: 0.3 },
      { t: 2000, x: 0.6, y: 0.6 },
      { t: 3000, x: 0.5, y: 0.5 },
    ];
    const detected = [
      { t: 1040, x: 0.31, y: 0.3 }, // matches the first
      { t: 2050, x: 0.9, y: 0.9 }, // right time, wrong place
    ];
    const result = matchEvents(emitted, detected, { now: 10_000 });
    expect(result).toMatchObject({ emitted: 3, detected: 2, matched: 1, missed: 2, pending: 0, extra: 1 });
    expect(result.meanError).toBeCloseTo(0.01, 6);
  });

  it('prefers the closest detection when several fall inside the time window', () => {
    const emitted = [{ t: 1000, x: 0.5, y: 0.5 }];
    const detected = [
      { t: 1100, x: 0.56, y: 0.5 },
      { t: 1200, x: 0.5, y: 0.51 },
    ];
    const result = matchEvents(emitted, detected, { now: 10_000 });
    expect(result).toMatchObject({ matched: 1, extra: 1 });
    expect(result.meanError).toBeCloseTo(0.01, 6);
  });

  it('counts a very recent flash as pending rather than missed', () => {
    const result = matchEvents([{ t: 5000, x: 0.5, y: 0.5 }], [], { now: 5100 });
    expect(result).toMatchObject({ matched: 0, missed: 0, pending: 1 });
  });
});

describe('exposure model (illustrative)', () => {
  const sixtyFps = { frameIntervalMs: FRAME_MS, exposureMs: 8 };

  it('gives full exposure when the flash covers the whole window and none when it misses it', () => {
    expect(flashExposure({ ...sixtyFps, frameIndex: 3, flashStartMs: 40, flashDurationMs: 30 })).toBe(1);
    expect(flashExposure({ ...sixtyFps, frameIndex: 3, flashStartMs: 59, flashDurationMs: 5 })).toBe(0);
    expect(flashExposure({ ...sixtyFps, frameIndex: 3, flashStartMs: 54, flashDurationMs: 5 })).toBeCloseTo(0.5, 6);
  });

  it('agrees with the pipeline: flashes the model fully exposes are found, flashes it misses are not', () => {
    const rand = mulberry32(42);
    for (const flashDurationMs of [5, 30]) {
      for (let trial = 0; trial < 25; trial++) {
        const flashStartMs = 400 + rand() * FRAME_MS; // random phase within one frame interval
        const timing = { ...sixtyFps, flashStartMs, flashDurationMs };
        const peak = peakFlashExposure(timing);
        const { hits } = runSequence({
          frames: 60,
          seed: 100 + trial,
          flashesFor: (frameIndex) => {
            const intensity = flashExposure({ ...timing, frameIndex });
            return intensity > 0 ? [dot({ intensity })] : [];
          },
        });
        if (peak >= 0.6) expect(hits).toHaveLength(1);
        if (peak === 0) expect(hits).toHaveLength(0);
        // A 30 ms flash always covers at least one whole 8 ms exposure at 60 fps.
        if (flashDurationMs === 30) expect(peak).toBe(1);
      }
    }
  });
});
