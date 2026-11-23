import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

/** Short commit id plus build time, shown in the app so a stale cached copy is easy to spot. */
function buildId(command) {
  if (command !== 'build') return 'dev';
  let commit = process.env.GITHUB_SHA?.slice(0, 7);
  if (!commit) {
    try {
      commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      commit = 'local';
    }
  }
  const builtAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `${commit} · ${builtAt} UTC`;
}

// `npm run dev:https` (mode "https") serves over a self-signed certificate so an
// iPhone on the same Wi-Fi can open the page as a secure context, which
// getUserMedia requires. Plain `npm run dev` stays on http://localhost.
export default defineConfig(({ mode, command }) => ({
  // Relative base so the build works from any sub-path (e.g. GitHub Pages).
  base: './',
  plugins: mode === 'https' ? [basicSsl()] : [],
  define: {
    __BUILD_ID__: JSON.stringify(buildId(command)),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
}));
