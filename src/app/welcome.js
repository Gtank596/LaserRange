// Remembers whether the first-run welcome (what the app does, and the safety
// reminder) has been read and acknowledged on this device.
//
// The record lives in localStorage, like the saved calibration. Safari and the
// home-screen app keep separate storage, so each shows the welcome once.
// If the wording of the safety reminder changes in a way people should read
// again, raise WELCOME_VERSION and the welcome is shown once more.

export const WELCOME_VERSION = 1;
const KEY = 'laserrange.welcome';

const deviceStorage = () => (typeof localStorage === 'undefined' ? null : localStorage);

// When the browser refuses to store anything (private browsing), the
// acknowledgement still holds until the page is closed, so the welcome cannot
// trap someone in a loop.
let acknowledgedThisVisit = false;

/** @param {Pick<Storage, 'getItem'> | null} [storage] */
export function hasSeenWelcome(storage = deviceStorage()) {
  if (acknowledgedThisVisit) return true;
  try {
    const value = JSON.parse(storage?.getItem(KEY) ?? 'null');
    return value?.version === WELCOME_VERSION;
  } catch {
    return false;
  }
}

/**
 * @param {Pick<Storage, 'setItem'> | null} [storage]
 * @returns {boolean} false if the browser refused to store it; it is then remembered for this visit only
 */
export function markWelcomeSeen(storage = deviceStorage(), now = new Date()) {
  acknowledgedThisVisit = true;
  try {
    if (!storage) return false;
    storage.setItem(KEY, JSON.stringify({ version: WELCOME_VERSION, at: now.toISOString() }));
    return true;
  } catch {
    return false;
  }
}

/** For tests: forget the acknowledgement held in memory. */
export function forgetWelcomeForTests() {
  acknowledgedThisVisit = false;
}
