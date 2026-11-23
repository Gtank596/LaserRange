import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:https` (mode "https") serves over a self-signed certificate so an
// iPhone on the same Wi-Fi can open the page as a secure context, which
// getUserMedia requires. Plain `npm run dev` stays on http://localhost.
export default defineConfig(({ mode }) => ({
  // Relative base so the build works from any sub-path (e.g. GitHub Pages).
  base: './',
  plugins: mode === 'https' ? [basicSsl()] : [],
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
}));
