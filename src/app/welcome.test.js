import { beforeEach, describe, expect, it } from 'vitest';
import { forgetWelcomeForTests, hasSeenWelcome, markWelcomeSeen, WELCOME_VERSION } from './welcome.js';

/** A stand-in for localStorage. */
function fakeStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
  };
}

const refusing = {
  getItem() {
    throw new Error('storage is blocked');
  },
  setItem() {
    throw new Error('storage is blocked');
  },
};

describe('the first-run welcome', () => {
  beforeEach(() => forgetWelcomeForTests());

  it('has not been seen on a fresh device', () => {
    expect(hasSeenWelcome(fakeStorage())).toBe(false);
  });

  it('is remembered on the device once acknowledged', () => {
    const storage = fakeStorage();
    expect(markWelcomeSeen(storage, new Date('2026-11-27T20:00:00Z'))).toBe(true);
    forgetWelcomeForTests(); // as if the app had been closed and opened again
    expect(hasSeenWelcome(storage)).toBe(true);
    expect(JSON.parse(storage.items.get('laserrange.welcome'))).toEqual({ version: WELCOME_VERSION, at: '2026-11-27T20:00:00.000Z' });
  });

  it('is shown again when the reminder has a newer version than the one acknowledged', () => {
    const storage = fakeStorage({ 'laserrange.welcome': JSON.stringify({ version: WELCOME_VERSION - 1, at: '2026-01-01T00:00:00.000Z' }) });
    expect(hasSeenWelcome(storage)).toBe(false);
  });

  it('treats a damaged record as not seen', () => {
    expect(hasSeenWelcome(fakeStorage({ 'laserrange.welcome': '{not json' }))).toBe(false);
    expect(hasSeenWelcome(fakeStorage({ 'laserrange.welcome': '"yes"' }))).toBe(false);
  });

  it('holds for this visit when the browser refuses to store anything', () => {
    expect(hasSeenWelcome(refusing)).toBe(false);
    expect(markWelcomeSeen(refusing)).toBe(false);
    expect(hasSeenWelcome(refusing)).toBe(true);
  });

  it('holds for this visit when there is no storage at all', () => {
    expect(hasSeenWelcome(null)).toBe(false);
    expect(markWelcomeSeen(null)).toBe(false);
    expect(hasSeenWelcome(null)).toBe(true);
  });
});
