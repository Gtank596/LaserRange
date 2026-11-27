/* global __BUILD_ID__ */
import { checkForNewServiceWorker } from '../pwa/register.js';

/** Commit id and build time of this copy of the app ("dev" on the dev server). */
export const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

/**
 * Markup for the build label and update button shown at the bottom of a screen.
 * An installed home-screen app has no reload button, and the host lets the
 * browser reuse a saved copy of the page for a while, so the app needs its own
 * way to fetch the newest version.
 */
export const buildFooterHtml = `
  <footer class="build-footer">
    <span>Build ${BUILD_ID}</span>
    <button class="link-button" type="button" data-action="update">Check for update</button>
  </footer>`;

/** Wires up the button rendered by buildFooterHtml inside `root`. */
export function attachBuildFooter(root) {
  const button = root.querySelector('[data-action="update"]');
  if (!button) return;
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Checking…';
    try {
      // cache: 'reload' skips every saved copy (the browser's and the offline
      // one) and fails when there is no connection, so "Offline" below is true.
      await fetch(window.location.pathname, { cache: 'reload' });
      // Also fetch the newest offline copy, then reload: opening the page asks
      // the network first, so the reload shows the newest build.
      await checkForNewServiceWorker();
      window.location.reload();
    } catch {
      button.disabled = false;
      button.textContent = 'Offline. Try again';
    }
  });
}
