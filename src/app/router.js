// Minimal hash router. A screen is a function (root, param) => cleanup | void;
// the cleanup runs before the next screen mounts (the camera screen relies on
// this to release the camera when you navigate away). The route is the first
// part of the hash path and `param` is the rest: #/history/abc is the
// `history` screen with param "abc".

/**
 * @param {HTMLElement} root
 * @param {Record<string, (root: HTMLElement, param: string) => (void | (() => void))>} routes keyed by the first part of the hash path, '' is home
 * @param {{ gate?: () => (null | ((root: HTMLElement, param: string) => (void | (() => void)))) }} [options]
 *   gate: asked before every screen. If it returns a screen, that one is shown
 *   instead, whatever the address says (used for the first-run welcome).
 */
export function startRouter(root, routes, { gate } = {}) {
  let cleanup = null;
  let first = true;

  const render = () => {
    const [key, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
    const screen = gate?.() ?? routes[key] ?? routes[''];
    cleanup?.();
    root.replaceChildren();
    cleanup = screen(root, decodeURIComponent(rest.join('/'))) ?? null;
    window.scrollTo(0, 0);
    if (!first) {
      // Move focus to the new screen's heading so screen readers announce it.
      const heading = root.querySelector('h1');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
    }
    first = false;
  };

  window.addEventListener('hashchange', render);
  render();
}

/**
 * Goes to a screen, and shows it afresh even when the address is already
 * that screen's (a plain link would do nothing then).
 * @param {string} hash e.g. '#/' or '#/camera'
 */
export function navigate(hash) {
  if (location.hash === hash) window.dispatchEvent(new Event('hashchange'));
  else location.hash = hash;
}
