import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { renderServiceWorker } from './src/pwa/renderServiceWorker.js';

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

/** Every file under a folder, as paths relative to it. */
function listFiles(dir, root = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name), root) : [relative(root, join(dir, entry.name))],
  );
}

/**
 * Writes sw.js into the finished build. It runs last and lists whatever is
 * actually in the build folder, so the offline copy can never miss a file.
 */
function serviceWorkerPlugin(id) {
  let outDir = 'dist';
  return {
    name: 'laserrange-service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const template = readFileSync(new URL('./src/pwa/sw.template.js', import.meta.url), 'utf8');
      writeFileSync(join(outDir, 'sw.js'), renderServiceWorker(template, { buildId: id, files: listFiles(outDir) }));
    },
  };
}

// `npm run dev:https` (mode "https") serves over a self-signed certificate so an
// iPhone on the same Wi-Fi can open the page as a secure context, which
// getUserMedia requires. Plain `npm run dev` stays on http://localhost.
export default defineConfig(({ mode, command }) => {
  const id = buildId(command);
  return {
    // Relative base so the build works from any sub-path (e.g. GitHub Pages).
    base: './',
    plugins: [...(mode === 'https' ? [basicSsl()] : []), serviceWorkerPlugin(id)],
    define: {
      __BUILD_ID__: JSON.stringify(id),
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.js'],
    },
  };
});
