import { addressForReading, appAddress } from '../../guide/address.js';
import { CARD_LIMITS, cleanCardText, loadCardText, saveCardText } from '../../guide/cardText.js';
import { qrSvg } from '../../guide/qr.js';
import { icons } from '../../ui/icons.js';

// The gift card: a 4 x 6 inch card to print and cut out, with the code that
// opens the app and three lines that can be changed before printing.
//
// The card makes no claim about what the app can do; the guide carries the
// account of what has and has not been tested, and the safety notes.

const CARD_TARGET = `
  <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <circle cx="20" cy="20" r="18" fill="none" stroke="#285D51" stroke-width="2.4"/>
    <circle cx="20" cy="20" r="11" fill="none" stroke="#285D51" stroke-width="2.4"/>
    <circle cx="20" cy="20" r="4" fill="#285D51"/>
    <circle cx="26.5" cy="14.5" r="3" fill="#E08A2C"/>
  </svg>`;

export function cardScreen(root) {
  const { address, own } = appAddress();

  root.innerHTML = `
    <main class="screen paper-screen">
      <div class="no-print">
        <header class="app-bar"><a class="back-link" href="#/guide">${icons.back}Guide</a></header>
        <h1 class="screen-title">Gift card</h1>
        <p class="lede">A card to give with the cartridge. Scanning its code with the iPhone camera opens the app.</p>

        <section class="card" aria-labelledby="card-words">
          <div class="card__head"><h2 class="card__title" id="card-words">Words on the card</h2></div>
          <div class="card-form">
            <div class="field">
              <label for="card-in-to">For</label>
              <input id="card-in-to" type="text" maxlength="${CARD_LIMITS.to}" autocomplete="off" />
            </div>
            <div class="field">
              <label for="card-in-message">Message</label>
              <textarea id="card-in-message" rows="3" maxlength="${CARD_LIMITS.message}"></textarea>
            </div>
            <div class="field">
              <label for="card-in-from">From</label>
              <input id="card-in-from" type="text" maxlength="${CARD_LIMITS.from}" autocomplete="off" />
            </div>
          </div>
          <p class="fine-print" id="card-saved" style="margin-top:8px">These words are kept on this device only. A line left empty is left off the card.</p>
        </section>

        <button class="btn btn--primary btn--block" id="card-print" type="button">${icons.print}Print the card</button>
        <ol class="steps">
          <li>Use thick paper or card if the printer takes it. Any size setting works: the code scans at any size.</li>
          <li>Cut along the dashed line. At 100% the card is 4 × 6 inches.</li>
          <li>Before wrapping it, scan the printed code with an iPhone to check it opens the app.</li>
        </ol>
        ${own ? '' : `<p class="fine-print">This is a development copy of the app, so the code points at the published one: ${addressForReading(address)}</p>`}
      </div>

      <div class="gift-card">
        <div class="gift-card__inner">
        <div class="gift-card__brand">${CARD_TARGET}<span>LASERRANGE</span></div>
        <p class="gift-card__to" id="card-to"></p>
        <p class="gift-card__message" id="card-message"></p>
        <div class="gift-card__code">${qrSvg(address, { label: `QR code for ${addressForReading(address)}` })}</div>
        <ol class="gift-card__steps">
          <li>Point the iPhone camera at the code and tap the link.</li>
          <li>In Safari, tap Share, then Add to Home Screen.</li>
          <li>Open LaserRange from its new icon.</li>
        </ol>
        <p class="gift-card__address">${addressForReading(address)}</p>
        <p class="gift-card__from" id="card-from"></p>
        </div>
      </div>
    </main>`;

  const $ = (selector) => root.querySelector(selector);
  const inputs = { to: $('#card-in-to'), message: $('#card-in-message'), from: $('#card-in-from') };

  function show(text) {
    $('#card-to').textContent = text.to ? `For ${text.to}` : '';
    $('#card-to').hidden = !text.to;
    $('#card-message').textContent = text.message;
    $('#card-message').hidden = !text.message;
    $('#card-from').textContent = text.from ? `From ${text.from}` : '';
    $('#card-from').hidden = !text.from;
  }

  const typed = () => cleanCardText({ to: inputs.to.value, message: inputs.message.value, from: inputs.from.value });

  const saved = loadCardText();
  for (const field of Object.keys(inputs)) inputs[field].value = saved[field];
  show(saved);

  for (const input of Object.values(inputs)) {
    input.addEventListener('input', () => {
      const text = typed();
      show(text);
      if (!saveCardText(text)) {
        $('#card-saved').textContent = 'This browser would not store these words, so they will have to be typed again next time. The card still prints as shown.';
      }
    });
  }
  $('#card-print').addEventListener('click', () => window.print());
}
