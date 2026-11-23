// Small inline icon set. Icons are decorative (aria-hidden); every status that
// uses one also carries text, so nothing is communicated by icon or colour alone.

const stroke = (body) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const icons = {
  logo: stroke('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>'),
  check: stroke('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  circle: stroke('<circle cx="12" cy="12" r="8" stroke-dasharray="3 3.3"/>'),
  alert: stroke('<path d="M12 3.5L2.5 20h19L12 3.5z"/><path d="M12 10v4.5"/><path d="M12 17.3v.2"/>'),
  info: stroke('<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.3v.2"/>'),
  play: stroke('<path d="M7 4.5v15l12-7.5-12-7.5z" fill="currentColor"/>'),
  stop: stroke('<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>'),
  clock: stroke('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  camera: stroke('<path d="M3 8.5a2 2 0 0 1 2-2h2.2l1.4-2h6.8l1.4 2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5z"/><circle cx="12" cy="13" r="3.6"/>'),
  back: stroke('<path d="M15 5l-7 7 7 7"/>'),
  forward: stroke('<path d="M9 5l7 7-7 7"/>'),
  flask: stroke('<path d="M9 3h6"/><path d="M10 3v6l-5.2 9a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 15h9"/>'),
  copy: stroke('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M5 15.5V6.5a2 2 0 0 1 2-2h8.5"/>'),
  target: stroke('<circle cx="12" cy="12" r="8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>'),
  pulse: stroke('<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>'),
};
