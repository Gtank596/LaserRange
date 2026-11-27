// Minimal hash router. A screen is a function (root, param) => cleanup | void;
// the cleanup runs before the next screen mounts (the camera screen relies on
// this to release the camera when you navigate away). The route is the first
// part of the hash path and `param` is the rest: #/history/abc is the
// `history` screen with param "abc".

/**
 * @param {HTMLElement} root
 * @param {Record<string, (root: HTMLElement, param: string) => (void | (() => void))>} routes keyed by the first part of the hash path, '' is home
 */
export function startRouter(root, routes) {
  let cleanup = null;
  let first = true;

  const render = () => {
    const [key, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
    const screen = routes[key] ?? routes[''];
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
