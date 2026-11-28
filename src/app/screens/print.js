import {
  barMmFromMeasurement,
  CHECK_BAR_MM,
  clearBarMm,
  loadBarEntry,
  loadBarMm,
  MM_PER_INCH,
  saveBarMm,
} from '../../calibration/printScale.js';
import { getTarget, printableTargetSvg, sheetSizeMm } from '../../calibration/targets.js';
import { icons } from '../../ui/icons.js';

// Printing the target, and telling the app how big it actually came out.
//
// UNVERIFIED ASSUMPTION: that a browser prints the sheet at 100%. The first
// real print came out at 95% (the 50 mm bar measured 47.5 mm). Printers and
// print dialogs shrink pages in ways a web page cannot see or prevent, so the
// sheet carries a bar to measure and this screen takes the measurement, from a
// millimetre or an inch ruler, of the bar or of one side of the square.

/** 49.2125 -> "1 15/16": the nearest thirty-second, the way an inch ruler is read. */
function inchFraction(mm) {
  const parts = Math.round((mm / MM_PER_INCH) * 32);
  const whole = Math.floor(parts / 32);
  let top = parts % 32;
  let bottom = 32;
  while (top && top % 2 === 0) {
    top /= 2;
    bottom /= 2;
  }
  return [whole || '', top ? `${top}/${bottom}` : ''].filter(Boolean).join(' ') || '0';
}

export function printScreen(root) {
  const target = getTarget();
  const sheet = sheetSizeMm(target);
  /** What can be measured, and its length when the sheet is printed at 100%. */
  const FEATURES = {
    bar: { name: 'the bar', fullSizeMm: CHECK_BAR_MM, inchExample: '1 15/16 or 1.94' },
    square: { name: 'one side of the square', fullSizeMm: target.squareMm, inchExample: '7 1/16 or 7.06' },
  };
  const usesInches = typeof navigator !== 'undefined' && navigator.language === 'en-US';

  root.innerHTML = `
    <main class="screen print-screen">
      <div class="no-print">
        <header class="app-bar"><a class="back-link" href="#/calibrate">${icons.back}Calibrate</a></header>
        <h1 class="screen-title">Print the target</h1>
        <p class="lede">${target.name}: a ${target.squareMm} mm square with ${target.ringCount} rings. It fits on Letter or A4 paper.</p>
        <ol class="steps">
          <li>Press Print. In the print window choose <strong>100%</strong> or <strong>Actual size</strong>, and turn off anything called “Fit to page”, “Shrink to fit” or “Fit to printable area”.</li>
          <li>Measure the printed sheet with a ruler: one side of the square (${target.squareMm} mm, ${inchFraction(target.squareMm)} in at full size), or the bar near the bottom of it (${CHECK_BAR_MM} mm, ${inchFraction(CHECK_BAR_MM)} in).</li>
          <li>Enter what you measured below. The target works at any size: ring scores do not depend on it.</li>
          <li>Mount the sheet flat. A curled or creased sheet bends the square and shifts where hits are placed.</li>
        </ol>
        <button class="btn btn--primary btn--block" id="print-button" type="button">Print</button>
        <p class="fine-print">Printing is usually easiest from a computer: open this same page there.</p>

        <section class="card" aria-labelledby="bar-title">
          <div class="card__head"><h2 class="card__title" id="bar-title">What the print measures</h2></div>
          <p class="banner" id="bar-status" role="status" aria-live="polite"></p>
          <div class="controls" style="margin-top:12px">
            <div class="field">
              <label for="bar-of">What you measured</label>
              <select id="bar-of">
                <option value="square">Side of square</option>
                <option value="bar">The bar</option>
              </select>
            </div>
            <div class="field">
              <label for="bar-unit">Ruler</label>
              <select id="bar-unit">
                <option value="mm">Millimetres</option>
                <option value="in">Inches</option>
              </select>
            </div>
            <div class="field">
              <label for="bar-length">Length</label>
              <input id="bar-length" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" />
            </div>
            <div class="field">
              <span class="field__label">&nbsp;</span>
              <button class="btn btn--secondary" id="bar-save" type="button">Save</button>
            </div>
          </div>
          <p class="fine-print" id="bar-hint" style="margin-top:8px"></p>
          <button class="link-button" id="bar-clear" type="button" style="margin-top:8px" hidden>Clear the measurement</button>
          <p class="fine-print" style="margin-top:12px">The side of the square gives the closer check: it is longer, so a small misreading of the ruler matters less. Only sizes in millimetres use this (the group size of a session). It applies to sessions you run from now on, on this device. Sessions already saved keep the size they were run with.</p>
        </section>
      </div>
      <div class="sheet" style="--sheet-w:${sheet.width}mm;--sheet-h:${sheet.height}mm">${printableTargetSvg(target)}</div>
    </main>`;

  const $ = (selector) => root.querySelector(selector);
  const input = /** @type {HTMLInputElement} */ ($('#bar-length'));
  const ofSelect = /** @type {HTMLSelectElement} */ ($('#bar-of'));
  const unitSelect = /** @type {HTMLSelectElement} */ ($('#bar-unit'));
  const statusEl = $('#bar-status');

  function say(kind, title, detail) {
    statusEl.className = `banner${kind === 'ok' ? ' banner--ok' : kind === 'error' ? ' banner--error' : ''}`;
    statusEl.innerHTML = `${kind === 'ok' ? icons.check : kind === 'error' ? icons.alert : icons.info}<span><strong></strong> <span></span></span>`;
    statusEl.querySelector('strong').textContent = title;
    statusEl.querySelector('span span').textContent = detail;
  }

  /** The full-size length of what is being measured, in the chosen ruler's words. */
  function fullSizeText() {
    const mm = FEATURES[ofSelect.value].fullSizeMm;
    return unitSelect.value === 'in' ? `${inchFraction(mm)} in` : `${mm} mm`;
  }

  function showHint() {
    const inches = unitSelect.value === 'in';
    input.placeholder = inches ? inchFraction(FEATURES[ofSelect.value].fullSizeMm) : String(FEATURES[ofSelect.value].fullSizeMm);
    input.inputMode = inches ? 'text' : 'decimal';
    $('#bar-hint').textContent = `At full size ${FEATURES[ofSelect.value].name} is ${fullSizeText()}.${inches ? ` Fractions are fine: write ${FEATURES[ofSelect.value].inchExample}.` : ''}`;
  }

  function showSaved() {
    const barMm = loadBarMm();
    const entry = loadBarEntry();
    $('#bar-clear').hidden = barMm === null;
    if (barMm === null) {
      ofSelect.value = 'square';
      unitSelect.value = usesInches ? 'in' : 'mm';
      input.value = '';
      say('info', 'No measurement entered.', 'Sizes in millimetres assume the sheet printed at full size.');
      showHint();
      return;
    }
    ofSelect.value = entry?.of ?? 'bar';
    unitSelect.value = entry?.unit ?? 'mm';
    input.value = entry?.text ?? String(barMm);
    const percent = Math.round((barMm / CHECK_BAR_MM) * 1000) / 10;
    const squareMm = Math.round((target.squareMm * barMm) / CHECK_BAR_MM);
    say(
      'ok',
      'Measurement saved.',
      barMm === CHECK_BAR_MM
        ? 'The sheet printed at full size.'
        : `The sheet printed at ${percent}% of full size: the bar is ${barMm} mm and the square about ${squareMm} mm. Sizes in millimetres are corrected for this.`,
    );
    showHint();
  }

  function save() {
    const unit = unitSelect.value === 'in' ? 'in' : 'mm';
    const of = ofSelect.value === 'square' ? 'square' : 'bar';
    const barMm = barMmFromMeasurement(input.value, { unit, fullSizeMm: FEATURES[of].fullSizeMm });
    if (barMm === null) {
      say(
        'error',
        'That is not a length the app can use.',
        `At full size ${FEATURES[of].name} is ${fullSizeText()}, and a print is usually within a few percent of that. Check the number, and that “What you measured” and “Ruler” match what you did.`,
      );
      return;
    }
    if (!saveBarMm(barMm, undefined, new Date(), { text: input.value.trim(), unit, of })) {
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
  ofSelect.addEventListener('change', showHint);
  unitSelect.addEventListener('change', showHint);
  $('#bar-clear').addEventListener('click', () => {
    clearBarMm();
    showSaved();
  });
  showSaved();
}
