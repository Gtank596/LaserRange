// Registers the service worker that keeps a copy of the app on the device.
// Only in a built copy of the app: the dev server has no sw.js, and a saved
// copy would get in the way of live editing.
//
// UNVERIFIED ASSUMPTION: that the iPhone keeps this saved copy, in Safari and
// as a home-screen app, and that the camera still opens with no connection.

const supported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

export function registerServiceWorker() {
  if (!supported() || !import.meta.env.PROD) return;
  // After the page has loaded, so it never competes with first paint.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // No saved copy this time. The app still works online; the home screen says "not ready".
    });
  });
}

/**
 * Whether a saved copy of the app is in place.
 * @returns {Promise<'ready' | 'pending' | 'unsupported'>}
 *   ready: this page is being served by the service worker, so the next open works offline
 *   pending: a service worker is registered or installing but not yet in charge of this page
 *   unsupported: this browser or this copy of the app (the dev server) has none
 */
export async function offlineState() {
  if (!supported() || !import.meta.env.PROD) return 'unsupported';
  if (navigator.serviceWorker.controller) return 'ready';
  return 'pending';
}

/** Calls back once the service worker takes charge of this page. */
export function onOfflineReady(callback) {
  if (!supported()) return () => {};
  const handler = () => callback();
  navigator.serviceWorker.addEventListener('controllerchange', handler);
  return () => navigator.serviceWorker.removeEventListener('controllerchange', handler);
}

/** Asks the browser to look for a newer service worker now. Safe to call anywhere. */
export async function checkForNewServiceWorker() {
  try {
    if (!supported()) return;
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
  } catch {
    // Offline or no registration: nothing to do.
  }
}
