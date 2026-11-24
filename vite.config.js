import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.png', 'icons/*.png'],
      manifest: {
        name: 'Notebook',
        short_name: 'Notebook',
        description: 'Bullet journal and interstitial journal in one handwritten notebook.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#f3f3f1',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // handwriting fonts are precached (woff2 only) so the notebook looks right offline
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
