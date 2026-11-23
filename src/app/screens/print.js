import { getTarget, printableTargetSvg } from '../../calibration/targets.js';
import { icons } from '../../ui/icons.js';

export function printScreen(root) {
  const target = getTarget();
  root.innerHTML = `
    <main class="screen print-screen">
      <div class="no-print">
        <header class="app-bar"><a class="back-link" href="#/calibrate">${icons.back}Calibrate</a></header>
        <h1 class="screen-title">Print the target</h1>
        <p class="lede">${target.name}: a ${target.squareMm} mm square with ${target.ringCount} rings. It fits on Letter or A4 paper.</p>
        <ol class="steps">
          <li>Press Print and choose <strong>100%</strong> or <strong>Actual size</strong>. Turn off “Fit to page”.</li>
          <li>Check the bar at the bottom of the sheet with a ruler. It should measure 50 mm. If it does not, sizes in millimetres will be wrong (ring scores are unaffected).</li>
          <li>Mount it flat. A curled or creased sheet bends the square and shifts where hits are placed.</li>
        </ol>
        <button class="btn btn--primary btn--block" id="print-button" type="button">Print</button>
        <p class="fine-print">Printing is usually easiest from a computer: open this same page there.</p>
      </div>
      <div class="sheet">${printableTargetSvg(target)}</div>
    </main>`;

  root.querySelector('#print-button').addEventListener('click', () => window.print());
}
