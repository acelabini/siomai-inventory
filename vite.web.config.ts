import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA, type VitePWAOptions } from 'vite-plugin-pwa';

// This configuration belongs only to the standalone web build, never Forge.
export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'prompt',
  injectRegister: 'script',
  includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
  manifest: {
    name: 'Siomai Inventory',
    short_name: 'Siomai',
    description: 'An offline inventory ledger for your food cart.',
    id: './',
    start_url: './',
    scope: './',
    display: 'standalone',
    orientation: 'portrait-primary',
    theme_color: '#1F6A49',
    background_color: '#FFFEF8',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/\/api(?:\/|$)/, /\.[^/]+$/],
    runtimeCaching: [],
    // A new shell waits until the old page closes/reloads; never reload a form.
    skipWaiting: false,
    clientsClaim: false,
    cleanupOutdatedCaches: true,
  },
};

export default defineConfig({
  root: 'src/renderer',
  base: './',
  publicDir: path.resolve('assets/pwa'),
  define: { 'import.meta.env.SIOMAI_WEB': JSON.stringify('true') },
  plugins: [react(), {
    name: 'web-apple-touch-icon',
    transformIndexHtml: () => [{ tag: 'link', attrs: { rel: 'apple-touch-icon', href: './apple-touch-icon.png' }, injectTo: 'head' }],
  }, VitePWA(pwaOptions)],
  build: { outDir: path.resolve('dist/web'), emptyOutDir: true },
});
