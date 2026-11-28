// The three lines of the gift card that can be changed before printing. They
// are kept on this device only, so a reprint does not mean typing them again.

const KEY = 'laserrange.card.v1';

export const CARD_DEFAULTS = Object.freeze({
  to: 'Dad',
  message: 'Merry Christmas! Your own practice range, to go with the laser cartridge.',
  from: 'Gabriel',
});

/** Longest each line may be, in characters: what fits on the card. */
export const CARD_LIMITS = Object.freeze({ to: 24, message: 140, from: 40 });

/** Any value in, a usable set of lines out. A line may be empty (it is then left off the card). */
export function cleanCardText(value) {
  const out = {};
  for (const field of Object.keys(CARD_DEFAULTS)) {
    const raw = value && typeof value === 'object' ? value[field] : undefined;
    out[field] = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, CARD_LIMITS[field]) : CARD_DEFAULTS[field];
  }
  return out;
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadCardText(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(KEY);
    return cleanCardText(raw ? JSON.parse(raw) : null);
  } catch {
    return cleanCardText(null);
  }
}

/** Returns false when the browser would not store it (the card still prints as typed). */
export function saveCardText(text, storage = defaultStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(KEY, JSON.stringify(cleanCardText(text)));
    return true;
  } catch {
    return false;
  }
}
