import { icons } from '../../ui/icons.js';
import { appState } from '../state.js';

const backLink = `<a class="back-link" href="#/">${icons.back}Home</a>`;

/** Sessions are not built yet; this screen says so plainly and shows what is still needed. */
export function sessionScreen(root) {
  const checked = Boolean(appState.cameraCheck);
  root.innerHTML = `
    <main class="screen">
      <header class="app-bar">${backLink}</header>
      <h1 class="screen-title">Start session</h1>
      <p class="banner">${icons.info}<span><strong>Not built yet.</strong> Live sessions need the steps below. Nothing on this screen detects or scores anything.</span></p>

      <section class="card" aria-labelledby="needs-title">
        <div class="card__head"><h2 class="card__title" id="needs-title">What a session needs</h2></div>
        <ul class="checklist">
          <li class="${checked ? 'is-done' : ''}">
            ${checked ? icons.check : icons.circle}
            <span>Camera check <small>${checked ? 'Done in this visit.' : 'Available now. Run it to see real frame timing.'}</small></span>
          </li>
          <li class="${appState.calibration ? 'is-done' : ''}">
            ${appState.calibration ? icons.check : icons.circle}
            <span>Target calibration <small>${appState.calibration ? 'A calibration is saved on this device.' : 'Available now from the home screen.'}</small></span>
          </li>
          <li>${icons.circle}<span>Flash detection <small>Works on simulated flashes in the Detection lab. Not yet measured on a real camera (milestone 6).</small></span></li>
          <li>${icons.circle}<span>Saving sessions <small>Planned: on-device storage (milestone 7).</small></span></li>
        </ul>
      </section>

      <a class="btn btn--primary btn--block" href="#/camera">${icons.camera}Open camera check</a>

      <p class="fine-print">LaserRange only watches a target for flashes of light. It cannot tell whether a firearm is unloaded or safe. That check is always yours.</p>
    </main>`;
}

export function historyScreen(root) {
  root.innerHTML = `
    <main class="screen">
      <header class="app-bar">${backLink}</header>
      <h1 class="screen-title">History</h1>
      <section class="card empty">
        ${icons.clock}
        <h2>No saved sessions yet</h2>
        <p>Sessions will be stored on this device once session saving is built (milestone 7). Nothing is uploaded.</p>
      </section>
    </main>`;
}
