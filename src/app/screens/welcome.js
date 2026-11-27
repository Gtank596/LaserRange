import { icons } from '../../ui/icons.js';
import { navigate } from '../router.js';
import { hasSeenWelcome, markWelcomeSeen } from '../welcome.js';

// The first-run welcome: what the app does, the safety reminder, and what to
// expect from the camera permission prompt. Shown before anything else until
// it has been acknowledged on this device, and reachable from the dashboard
// afterwards.
//
// The safety wording is deliberately narrow. The app cannot know anything
// about a firearm, so it never says or implies that one is safe or unloaded,
// and it gives no handling advice: it points to the instructions that came
// with the firearm and the laser cartridge.

export function welcomeScreen(root) {
  const firstRun = !hasSeenWelcome();

  root.innerHTML = `
    <main class="screen">
      <header class="app-bar">
        ${firstRun ? `<span class="brand">${icons.logo}<span>LASERRANGE</span></span>` : `<a class="back-link" href="#/">${icons.back}Home</a>`}
      </header>
      <h1 class="screen-title">${firstRun ? 'Welcome' : 'Welcome and safety'}</h1>

      <section class="card" aria-labelledby="w-what-title">
        <div class="card__head"><h2 class="card__title" id="w-what-title">What this app does</h2></div>
        <ul class="checklist">
          <li>${icons.target}<span>Watches a printed target <small>The phone’s rear camera looks at the target and counts each flash of red light from a laser training cartridge.</small></span></li>
          <li>${icons.pulse}<span>Scores your hits <small>Once the printed target has been lined up on screen, each hit is placed on the rings and scored.</small></span></li>
          <li>${icons.clock}<span>Keeps sessions on this phone <small>No account. The camera video is looked at on the phone and is never saved or sent anywhere.</small></span></li>
        </ul>
      </section>

      <section class="card card--notice" aria-labelledby="w-safety-title">
        <div class="card__head"><h2 class="card__title" id="w-safety-title">${icons.alert}Safety</h2></div>
        <ul class="checklist">
          <li>${icons.alert}<span>The app cannot tell whether a firearm is unloaded or safe <small>It only watches a target for flashes of light. That check is always yours, every time.</small></span></li>
          <li>${icons.info}<span>Follow the instructions that came with your firearm and your laser cartridge <small>This app does not replace them and gives no handling advice.</small></span></li>
          <li>${icons.info}<span>Never point a laser at anyone’s eyes or straight into the camera lens</span></li>
        </ul>
      </section>

      <div class="stack" id="w-ack" ${firstRun ? '' : 'hidden'}>
        <button class="btn btn--primary btn--block" id="w-understand" type="button">${icons.check}I understand</button>
        <p class="fine-print">You can read this again at any time from the dashboard.</p>
      </div>

      <div class="stack" id="w-next" ${firstRun ? 'hidden' : ''}>
        <section class="card" aria-labelledby="w-camera-title">
          <div class="card__head"><h2 class="card__title" id="w-camera-title">The camera</h2></div>
          <p>The first time you start a session or a camera check, the phone asks whether LaserRange may use the camera. Choose Allow. If the camera is refused, the app explains what to do.</p>
        </section>
        <p class="banner" id="w-storage" role="note" hidden>${icons.info}<span>This browser would not save that you have read this, so it will be shown again next time. Private browsing can cause this.</span></p>
        <div class="actions">
          <a class="btn btn--primary" href="#/camera">${icons.camera}Camera check</a>
          <a class="btn btn--secondary" href="#/" id="w-home">Dashboard</a>
        </div>
      </div>
    </main>`;

  const understand = root.querySelector('#w-understand');
  understand.addEventListener('click', () => {
    const stored = markWelcomeSeen();
    root.querySelector('#w-ack').hidden = true;
    root.querySelector('#w-next').hidden = false;
    root.querySelector('#w-storage').hidden = stored;
    root.querySelector('#w-camera-title').scrollIntoView({ block: 'center' });
  });

  // On the first run this screen is shown whatever the address is, so a plain
  // link to the dashboard might not change the address. Ask the router instead.
  root.querySelector('#w-home').addEventListener('click', (event) => {
    event.preventDefault();
    navigate('#/');
  });
  root.querySelector('a[href="#/camera"]').addEventListener('click', (event) => {
    event.preventDefault();
    navigate('#/camera');
  });
}
