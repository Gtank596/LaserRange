import { describe, expect, it } from 'vitest';
import { createTargetLock } from './targetLock.js';

const square = (shift = 0) => [
  { x: 0.2 + shift, y: 0.3 },
  { x: 0.8 + shift, y: 0.3 },
  { x: 0.8 + shift, y: 0.7 },
  { x: 0.2 + shift, y: 0.7 },
];
const found = (shift = 0) => ({ found: true, corners: square(shift) });
const missing = { found: false, reason: 'nothing' };

describe('createTargetLock', () => {
  it('does not lock on a single look', () => {
    const lock = createTargetLock();
    expect(lock.offer(found()).locked).toBe(false);
  });

  it('locks when two looks in a row find the square in the same place', () => {
    const lock = createTargetLock();
    lock.offer(found());
    const state = lock.offer(found(0.002));
    expect(state.locked).toBe(true);
    expect(state.corners).toEqual(square(0.002));
  });

  it('does not lock while the square is still moving in the picture', () => {
    const lock = createTargetLock();
    lock.offer(found(0));
    expect(lock.offer(found(0.03)).locked).toBe(false);
    expect(lock.offer(found(0.06)).locked).toBe(false);
    // The phone has come to rest.
    expect(lock.offer(found(0.061)).locked).toBe(true);
  });

  it('starts again after a look that finds nothing', () => {
    const lock = createTargetLock();
    lock.offer(found());
    expect(lock.offer(missing)).toEqual({ locked: false, corners: null });
    expect(lock.offer(found()).locked).toBe(false);
    expect(lock.offer(found()).locked).toBe(true);
  });

  it('can be asked for more agreement', () => {
    const lock = createTargetLock({ needed: 3 });
    lock.offer(found());
    expect(lock.offer(found()).locked).toBe(false);
    expect(lock.offer(found()).locked).toBe(true);
  });
});
