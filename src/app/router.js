// Minimal hash router. A screen is a function (root) => cleanup | void; the
// cleanup runs before the next screen mounts (the camera screen relies on this
// to release the camera when you navigate away).

/**
 * @param {HTMLElement} root
 * @param {Record<string, (root: HTMLElement) => (void | (() => void))>} routes keyed by hash path, '' is home
 */
export function startRouter(root, routes) {
  let cleanup = null;
  let first = true;

  const render = () => {
    const key = location.hash.replace(/^#\/?/, '');
    const screen = routes[key] ?? routes[''];
    cleanup?.();
    root.replaceChildren();
    cleanup = screen(root) ?? null;
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
