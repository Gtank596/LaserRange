import { describe, expect, it } from 'vitest';
import { createSkipCounter, describeSkips, totalSkips } from './skips.js';

const feed = (counter, statuses) => statuses.forEach((status) => counter.note(status));

describe('createSkipCounter', () => {
  it('counts nothing while every frame is fine', () => {
    const counter = createSkipCounter();
    feed(counter, ['warming', 'warming', 'ok', 'ok', 'ok']);
    expect(totalSkips(counter.counts())).toBe(0);
  });

  it('counts a spell of several frames once', () => {
    const counter = createSkipCounter();
    feed(counter, ['ok', 'large', 'large', 'large', 'ok']);
    expect(counter.counts().large).toBe(1);
  });

  it('counts each separate spell', () => {
    const counter = createSkipCounter();
    feed(counter, ['ok', 'large', 'large', 'ok', 'ok', 'large', 'ok', 'motion', 'ok']);
    expect(counter.counts()).toMatchObject({ large: 2, motion: 1, unstable: 0 });
  });

  it('treats the catching-up frames after a picture change as part of the same spell', () => {
    const counter = createSkipCounter();
    feed(counter, ['ok', 'unstable', 'adapting', 'adapting', 'unstable', 'adapting', 'ok', 'unstable', 'adapting', 'ok']);
    expect(counter.counts().unstable).toBe(2);
  });

  it('counts a change from one reason straight to another as two spells', () => {
    const counter = createSkipCounter();
    feed(counter, ['ok', 'large', 'motion', 'ok']);
    expect(counter.counts()).toMatchObject({ large: 1, motion: 1 });
  });

  it('counts flashes the grouping step refused, and ignores hits', () => {
    const counter = createSkipCounter();
    counter.note('ok', { accepted: true });
    counter.note('ok', { accepted: false, reason: 'persistent' });
    counter.note('ok', { accepted: false, reason: 'cooldown' });
    counter.note('ok', { accepted: false, reason: 'cooldown' });
    expect(counter.counts()).toMatchObject({ persistent: 1, cooldown: 2 });
  });

  it('does not count a refused flash twice when its spell was already counted', () => {
    // A flash cancelled by movement arrives as both a 'motion' frame and a refused event.
    const counter = createSkipCounter();
    counter.note('ok');
    counter.note('motion', { accepted: false, reason: 'motion' });
    counter.note('ok');
    expect(totalSkips(counter.counts())).toBe(1);
  });

  it('starts a new spell after a pause', () => {
    const counter = createSkipCounter();
    feed(counter, ['ok', 'large']);
    counter.breakRun();
    feed(counter, ['large', 'ok']);
    expect(counter.counts().large).toBe(2);
  });

  it('hands back a copy, not its own tally', () => {
    const counter = createSkipCounter();
    counter.counts().large = 99;
    expect(counter.counts().large).toBe(0);
  });
});

describe('describeSkips', () => {
  it('says "nothing" when nothing was skipped, or the record has no tally', () => {
    expect(describeSkips({ large: 0, motion: 0, unstable: 0, persistent: 0, cooldown: 0 })).toBe('nothing');
    expect(describeSkips(undefined)).toBe('nothing');
  });

  it('lists only the reasons that happened, in a fixed order', () => {
    expect(describeSkips({ cooldown: 1, large: 2, motion: 0, unstable: 0, persistent: 0 })).toBe('2 too big to be a hit · 1 too soon after a hit');
  });
});

describe('totalSkips', () => {
  it('adds up the reasons and survives a damaged record', () => {
    expect(totalSkips({ large: 2, motion: 1, unstable: 0, persistent: 0, cooldown: 3 })).toBe(6);
    expect(totalSkips({ large: 'many', motion: 1 })).toBe(1);
    expect(totalSkips(null)).toBe(0);
  });
});
