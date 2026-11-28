// The web address the printed QR code points at.

/** Where the app is published. Used whenever this copy of the app is not itself a published one. */
export const LIVE_ADDRESS = 'https://gtank596.github.io/LaserRange/';

const PRIVATE_HOST = /^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]$)/;

/**
 * The address to print. A copy of the app opened from a public https address
 * prints its own address, so the code keeps working if the app is ever moved.
 * A development copy (a computer on the home network, plain http) prints the
 * published address instead: its own would be useless on a card.
 * @param {{ protocol: string, hostname: string, origin: string, pathname: string }} [loc]
 * @returns {{ address: string, own: boolean }} own: true when it is this page's own address
 */
export function appAddress(loc = globalThis.location) {
  const host = loc?.hostname ?? '';
  const isPrivate = !host || PRIVATE_HOST.test(host) || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.test');
  if (loc?.protocol === 'https:' && !isPrivate) {
    // Drop a trailing file name (index.html); the hash route is not part of pathname.
    return { address: loc.origin + loc.pathname.replace(/[^/]*$/, ''), own: true };
  }
  return { address: LIVE_ADDRESS, own: false };
}

/** "gtank596.github.io/LaserRange/": the address as someone would type it. */
export function addressForReading(address) {
  return address.replace(/^https?:\/\//, '');
}
