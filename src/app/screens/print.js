import { BAR_RANGE_MM, CHECK_BAR_MM, clearBarMm, loadBarMm, parseBarMm, saveBarMm } from '../../calibration/printScale.js';
import { getTarget, printableTargetSvg, sheetSizeMm } from '../../calibration/targets.js';
import { icons } from '../../ui/icons.js';

// Printing the target, and telling the app how big it actually came out.
//
// UNVERIFIED ASSUMPTION: that a browser prints the sheet at 100%. The first
// real print came out at 95% (the 50 mm bar measured 47.5 mm). Printers and
// print dialogs shrink pages in ways a web page cannot see or prevent, so the
// sheet carries a bar to measure and this screen takes the measurement.

export function printScreen(root) {
  const target = getTarget();
  const sheet = sheetSizeMm(target);
  root.innerHTML = `
    <main class="screen print-screen">
      <div class="no-print">
        <header class="app-bar"><a class="back-link" href="#/calibrate">${icons.back}Calibrate</a></header>
        <h1 class="screen-title">Print the target</h1>
        <p class="lede">${target.name}: a ${target.squareMm} mm square with ${target.ringCount} rings. It fits on Letter or A4 paper.</p>
        <ol class="steps">
          <li>Press Print. In the print window choose <strong>100%</strong> or <strong>Actual size</strong>, and turn off anything called “Fit to page”, “Shrink to fit” or “Fit to printable area”.</li>
          <li>Measure the bar near the bottom of the printed square with a ruler. At full size it is ${CHECK_BAR_MM} mm long.</li>
          <li>If it is not ${CHECK_BAR_MM} mm, enter what it measures below. The target still works at any size: ring scores do not depend on it.</li>
          <li>Mount the sheet flat. A curled or creased sheet bends the square and shifts where hits are placed.</li>
        </ol>
        <button class="btn btn--primary btn--block" id="print-button" type="button">Print</button>
        <p class="fine-print">Printing is usually easiest from a computer: open this same page there.</p>

        <section class="card" aria-labelledby="bar-title">
          <div class="card__head"><h2 class="card__title" id="bar-title">What the bar measures</h2></div>
          <p class="banner" id="bar-status" role="status" aria-live="polite"></p>
          <div class="controls" style="margin-top:12px">
            <div class="field">
              <label for="bar-mm">Bar length (mm)</label>
              <input id="bar-mm" type="text" inputmode="decimal" autocomplete="off" placeholder="${CHECK_BAR_MM}" />
            </div>
            <div class="field">
              <span class="field__label">&nbsp;</span>
              <button class="btn btn--secondary" id="bar-save" type="button">Save</button>
            </div>
          </div>
          <button class="link-button" id="bar-clear" type="button" style="margin-top:8px" hidden>Clear the measurement</button>
          <p class="fine-print" style="margin-top:12px">Only sizes in millimetres use this (the group size of a session). It applies to sessions you run from now on, on this device. Sessions already saved keep the size they were run with.</p>
        </section>
      </div>
      <div class="sheet" style="--sheet-w:${sheet.width}mm;--sheet-h:${sheet.height}mm">${printableTargetSvg(target)}</div>
    </main>`;

  const $ = (selector) => root.querySelector(selector);
  const input = /** @type {HTMLInputElement} */ ($('#bar-mm'));
  const statusEl = $('#bar-status');

  function say(kind, title, detail) {
    statusEl.className = `banner${kind === 'ok' ? ' banner--ok' : kind === 'error' ? ' banner--error' : ''}`;
    statusEl.innerHTML = `${kind === 'ok' ? icons.check : kind === 'error' ? icons.alert : icons.info}<span><strong></strong> <span></span></span>`;
    statusEl.querySelector('strong').textContent = title;
    statusEl.querySelector('span span').textContent = detail;
  }

  function showSaved() {
    const barMm = loadBarMm();
    $('#bar-clear').hidden = barMm === null;
    if (barMm === null) {
      input.value = '';
      say('info', 'No measurement entered.', `Sizes in millimetres assume the sheet printed at full size (bar ${CHECK_BAR_MM} mm).`);
      return;
    }
    input.value = String(barMm);
    const percent = Math.round((barMm / CHECK_BAR_MM) * 1000) / 10;
    say(
      'ok',
      `Bar saved as ${barMm} mm.`,
      barMm === CHECK_BAR_MM
        ? 'The sheet printed at full size.'
        : `The sheet printed at ${percent}% of full size, so the square is about ${Math.round((target.squareMm * barMm) / CHECK_BAR_MM)} mm. Sizes in millimetres are corrected for this.`,
    );
  }

  function save() {
    if (parseBarMm(input.value) === null) {
      say('error', 'That is not a length the app can use.', `Enter the bar’s length in millimetres, between ${BAR_RANGE_MM.min} and ${BAR_RANGE_MM.max}. For example 47.5`);
      return;
    }
    if (!saveBarMm(input.value)) {
      say('error', 'The measurement could not be saved.', 'This browser refused to store it. Private browsing can cause this.');
      return;
    }
    showSaved();
  }

  $('#print-button').addEventListener('click', () => window.print());
  $('#bar-save').addEventListener('click', save);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') save();
  });
  $('#bar-clear').addEventListener('click', () => {
    clearBarMm();
    showSaved();
  });
  showSaved();
}
