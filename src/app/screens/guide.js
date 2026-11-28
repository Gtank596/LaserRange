import { getTarget } from '../../calibration/targets.js';
import { addressForReading, appAddress } from '../../guide/address.js';
import { qrSvg } from '../../guide/qr.js';
import { icons } from '../../ui/icons.js';
import { BUILD_ID } from '../build.js';

// The guide: how to set the app up and use it, to read on the phone or print
// and keep with the target. It is drawn as a sheet of paper on screen so that
// what is read is what prints.
//
// What it must not do: give firearm-handling advice, or say or imply that a
// firearm is safe. What it must do: say plainly what has and has not been
// tested. When the app changes, the wording here (button names, messages) has
// to be checked against the screens it describes.

export function guideScreen(root) {
  const target = getTarget();
  const { address, own } = appAddress();

  root.innerHTML = `
    <main class="screen paper-screen">
      <div class="no-print">
        <header class="app-bar"><a class="back-link" href="#/">${icons.back}Home</a></header>
        <h1 class="screen-title">Guide</h1>
        <p class="lede">How to set up and use LaserRange. Read it here, or print it to keep with the target: it takes about two pages.</p>
        <button class="btn btn--primary btn--block" id="guide-print" type="button">${icons.print}Print the guide</button>
        <a class="row-link" href="#/card">
          ${icons.gift}
          <span class="row-link__text">Gift card<small>A card to print, with the code that opens the app</small></span>
          ${icons.forward}
        </a>
        ${own ? '' : `<p class="fine-print">This is a development copy of the app, so the code below points at the published one: ${addressForReading(address)}</p>`}
      </div>

      <article class="paper guide">
        <header class="guide__head">
          <div>
            <p class="guide__brand">LASERRANGE</p>
            <h1>Quick guide</h1>
            <p>A phone app that watches a printed target and counts the flashes of a laser training cartridge.</p>
          </div>
        </header>

        <section>
          <h2><span>1</span>Put the app on the iPhone</h2>
          <div class="guide__with-code">
            <ol>
              <li>Point the iPhone camera at this code and tap the link that appears. It opens in Safari.</li>
              <li>In Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</li>
              <li>Open <strong>LaserRange</strong> from its new icon. Read the welcome and tap <strong>I understand</strong>.</li>
              <li>When the phone asks, allow the camera. Without it the app cannot see the target.</li>
            </ol>
            <figure class="guide__code">
              ${qrSvg(address, { label: `QR code for ${addressForReading(address)}` })}
              <figcaption>${addressForReading(address)}</figcaption>
            </figure>
          </div>
          <p class="guide__note">Once it has been opened with a connection, the app is meant to work without one.</p>
        </section>

        <section>
          <h2><span>2</span>Print and mount the target</h2>
          <ol>
            <li>In the app, open <strong>Print the target</strong> and press <strong>Print</strong>. This is easiest from a computer, at the same address.</li>
            <li>In the print window choose <strong>100%</strong> or <strong>Actual size</strong>, not “Fit to page”.</li>
            <li>Mount the sheet flat. Leave the white paper around the black border: do not trim it. The app finds the target by that border.</li>
          </ol>
          <p class="guide__note">The square should be about ${target.squareMm} mm (7 in) across. If it is not, the same screen takes its measured size. Ring scores do not depend on it.</p>
        </section>

        <section>
          <h2><span>3</span>Set up the phone</h2>
          <ul>
            <li>Prop the phone on a stand or tripod so it <strong>cannot move</strong>, with the rear camera facing the target.</li>
            <li>The <strong>whole sheet</strong> must be in the picture: the black border and the white paper around it.</li>
            <li>Use steady light. A light being switched on or off, or anything moving in the picture, makes the app stop counting for a moment.</li>
            <li>Keep red and shiny things out of the picture.</li>
          </ul>
        </section>

        <section>
          <h2><span>4</span>Run a session</h2>
          <ol>
            <li>Tap <strong>Start session</strong>, and <strong>Start session</strong> again on the next screen.</li>
            <li>The app looks for the target for a few seconds. When it says <strong>Session running</strong>, it is counting.</li>
            <li>Each flash it sees on the target is counted, marked on the rings and scored: 10 in the centre, down to 1 on the outer ring.</li>
            <li><strong>Pause</strong> stops the counting for a while. <strong>End session</strong> saves the session and shows the results.</li>
          </ol>
          <p class="guide__note">Keep the app open: locking the phone or switching to another app ends the session. If the phone or the target is moved, end the session and start a new one. Saved sessions and progress charts are under <strong>History</strong>.</p>
        </section>

        <section>
          <h2><span>5</span>What the numbers mean</h2>
          <dl>
            <div><dt>Hits</dt><dd>Flashes the app saw and counted.</dd></div>
            <div><dt>Score</dt><dd>The ring values of the hits, added up.</dd></div>
            <div><dt>Accuracy</dt><dd>The score as a share of the most those hits could have scored.</dd></div>
            <div><dt>Group size</dt><dd>The widest distance between any two hits.</dd></div>
          </dl>
          <p class="guide__note">A flash the camera did not see is not counted, and is not shown as a miss. The app only knows what it saw.</p>
        </section>

        <section>
          <h2><span>6</span>If something is not working</h2>
          <dl class="guide__fixes">
            <div><dt>“Could not find the target”</dt><dd>Check the whole border is in the picture, add light, and face the target more squarely. Then <strong>Try again</strong>. <strong>Count only</strong> runs a session without scores.</dd></div>
            <div><dt>Flashes are not being counted</dt><dd>After the session, <strong>Details</strong> has a line “Seen but not counted” that says why. Before the next one, open <strong>Detection settings</strong> and set <strong>Sensitivity</strong> to High.</dd></div>
            <div><dt>“The picture changed” or “Movement in view”</dt><dd>The light changed or something moved. Counting carries on by itself once the picture is steady.</dd></div>
            <div><dt>The app seems out of date</dt><dd>At the bottom of the home screen, tap <strong>Check for update</strong>. This needs a connection.</dd></div>
          </dl>
        </section>

        <section class="guide__safety">
          <h2>Safety</h2>
          <ul>
            <li><strong>The app cannot tell whether a firearm is unloaded or safe.</strong> It only watches a target for flashes of light. That check is always yours, every time.</li>
            <li>Follow the instructions that came with your firearm and your laser cartridge. This guide and the app do not replace them and give no handling advice.</li>
            <li>Never point a laser at anyone’s eyes or straight into the camera lens.</li>
          </ul>
        </section>

        <section>
          <h2>What has been tested, and what has not</h2>
          <p>LaserRange was made as a gift, not bought from a company. It was tested on an iPhone 15 Pro with a small test light, and tried once with the laser cartridge pressed by hand. How well it counts the cartridge in real use has not been measured yet, so expect it to need some adjusting.</p>
          <p><strong>Privacy:</strong> everything stays on the phone. The camera picture is never saved or sent anywhere, and there is no account.</p>
        </section>

        <footer class="guide__foot">LaserRange guide · build ${BUILD_ID}</footer>
      </article>
    </main>`;

  root.querySelector('#guide-print').addEventListener('click', () => window.print());
}
