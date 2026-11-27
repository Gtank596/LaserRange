import { summarizeSession } from '../../sessions/metrics.js';
import { getSessionStore } from '../../sessions/store.js';
import { icons } from '../../ui/icons.js';
import { formatClock, formatWhen, sessionSummaryHtml, sessionTagsHtml } from '../../ui/sessionView.js';

// Saved sessions: the list, and one session in full. Everything shown here is
// read from this device's own storage.

const storageProblemHtml = (error) => `
  <section class="card empty">
    ${icons.alert}
    <h2>Saved sessions could not be read</h2>
    <p>${error?.message ?? 'The browser refused access to its on-device storage.'} Private browsing can cause this.</p>
  </section>`;

/** One line of plain words for a session in the list. */
function listLine(session) {
  const summary = summarizeSession(session);
  const hits = `${summary.hits} hit${summary.hits === 1 ? '' : 's'}`;
  const score = summary.scored ? ` · ${summary.score} of ${summary.maxScore} points` : '';
  return `${hits}${score} · ${formatClock(session.durationMs)}`;
}

export function historyScreen(root) {
  root.innerHTML = `
    <main class="screen">
      <header class="app-bar"><a class="back-link" href="#/">${icons.back}Home</a></header>
      <h1 class="screen-title">History</h1>
      <div class="stack" id="h-body" aria-live="polite"><p class="fine-print">Loading…</p></div>
    </main>`;
  const body = root.querySelector('#h-body');
  let disposed = false;

  getSessionStore()
    .then((store) => store.list())
    .then((sessions) => {
      if (disposed) return;
      if (sessions.length === 0) {
        body.innerHTML = `
          <section class="card empty">
            ${icons.clock}
            <h2>No saved sessions yet</h2>
            <p>A session is saved here, on this device, when it ends with at least one hit. Nothing is uploaded.</p>
          </section>
          <a class="btn btn--primary btn--block" href="#/session">${icons.play}Start session</a>`;
        return;
      }
      body.innerHTML = `
        <p class="fine-print">${sessions.length} session${sessions.length === 1 ? '' : 's'} saved on this device, newest first.</p>
        <ul class="session-list">
          ${sessions
            .map(
              (session) => `
            <li>
              <a class="row-link" href="#/history/${encodeURIComponent(session.id)}">
                ${icons.target}
                <span class="row-link__text">${formatWhen(session.startedAt)}<small>${listLine(session)}</small><span class="row-link__tags">${sessionTagsHtml(session)}</span></span>
                ${icons.forward}
              </a>
            </li>`,
            )
            .join('')}
        </ul>`;
    })
    .catch((error) => {
      if (!disposed) body.innerHTML = storageProblemHtml(error);
    });

  return () => {
    disposed = true;
  };
}

export function sessionDetailScreen(root, id) {
  root.innerHTML = `
    <main class="screen">
      <header class="app-bar"><a class="back-link" href="#/history">${icons.back}History</a></header>
      <h1 class="screen-title">Session</h1>
      <p class="banner" id="d-status" role="status" aria-live="polite" hidden></p>
      <div class="stack" id="d-body"><p class="fine-print">Loading…</p></div>
    </main>`;
  const body = root.querySelector('#d-body');
  const statusEl = root.querySelector('#d-status');
  let disposed = false;
  let deleteArmed = 0;
  let copyTimer = 0;

  const say = (text) => {
    statusEl.hidden = false;
    statusEl.innerHTML = `${icons.info}<span></span>`;
    statusEl.querySelector('span').textContent = text;
  };

  getSessionStore()
    .then((store) => store.get(id).then((session) => ({ store, session })))
    .then(({ store, session }) => {
      if (disposed) return;
      if (!session) {
        body.innerHTML = `
          <section class="card empty">
            ${icons.clock}
            <h2>Session not found</h2>
            <p>It may have been deleted.</p>
          </section>`;
        return;
      }
      body.innerHTML = `
        ${sessionSummaryHtml(session)}
        <button class="btn btn--secondary btn--block" id="d-copy" type="button">${icons.copy}<span>Copy as text (JSON)</span></button>
        <button class="link-button" id="d-delete" type="button">Delete this session</button>`;

      const copyBtn = body.querySelector('#d-copy');
      copyBtn.addEventListener('click', async () => {
        let message = 'Copied';
        try {
          await navigator.clipboard.writeText(JSON.stringify({ app: 'LaserRange', export: 'session', ...session, summary: summarizeSession(session) }, null, 2));
        } catch {
          message = 'Copy was blocked';
        }
        copyBtn.querySelector('span').textContent = message;
        window.clearTimeout(copyTimer);
        copyTimer = window.setTimeout(() => (copyBtn.querySelector('span').textContent = 'Copy as text (JSON)'), 2500);
      });

      const deleteBtn = body.querySelector('#d-delete');
      deleteBtn.addEventListener('click', async () => {
        // Two taps, so a slip of the thumb does not lose a session.
        if (Date.now() - deleteArmed > 4000) {
          deleteArmed = Date.now();
          deleteBtn.textContent = 'Tap again to delete for good';
          return;
        }
        try {
          await store.remove(session.id);
          location.hash = '#/history';
        } catch {
          say('The session could not be deleted.');
        }
      });
    })
    .catch((error) => {
      if (!disposed) body.innerHTML = storageProblemHtml(error);
    });

  return () => {
    disposed = true;
    window.clearTimeout(copyTimer);
  };
}
