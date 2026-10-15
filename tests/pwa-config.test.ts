import 'fake-indexeddb/auto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBrowserDatabase, deleteBrowserDatabase } from '../src/browser/db';
import { createBrowserInventoryApi } from '../src/browser/browser-inventory-api';

describe('standalone PWA boundary', () => {
  it('provides an installable standalone manifest and caches only application assets', async () => {
    const configPath = path.resolve('vite.web.config.ts');
    expect(existsSync(configPath), 'standalone web config exists').toBe(true);
    const { pwaOptions } = await import('../vite.web.config');
    expect(pwaOptions.manifest).toMatchObject({
      name: 'Siomai Inventory', display: 'standalone', start_url: './', scope: './',
      theme_color: '#1F6A49', background_color: '#FFFEF8',
      icons: expect.arrayContaining([
        expect.objectContaining({ src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' }),
        expect.objectContaining({ src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }),
      ]),
    });
    expect(pwaOptions.injectRegister).toBe('script');
    expect(pwaOptions.workbox).toMatchObject({
      navigateFallback: 'index.html', runtimeCaching: [], skipWaiting: false, clientsClaim: false,
      globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
    });
    expect(pwaOptions.workbox?.navigateFallbackDenylist?.some((pattern: RegExp) => pattern.test('/api/sales'))).toBe(true);
    for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]] as const) {
      const png = readFileSync(path.resolve('assets/pwa', name));
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size]);
    }
  });

  it('preserves the ledger when the application is closed and reinitialized after an update', async () => {
    const name = `pwa-update-${crypto.randomUUID()}`;
    const original = createBrowserDatabase(name);
    const replacement = createBrowserDatabase(name);
    try {
      const api = createBrowserInventoryApi({ db: original });
      await api.saveSettings({ businessName: 'Cart saved before update' });
      original.close();
      const updated = createBrowserInventoryApi({ db: replacement });
      expect((await updated.getSettings()).businessName).toBe('Cart saved before update');
    } finally {
      original.close(); replacement.close();
      await deleteBrowserDatabase(name);
    }
  });

  it('activates a waiting shell at startup and reloads only after it takes control', async () => {
    expect(existsSync(path.resolve('src/renderer/pwa-update.ts')), 'startup update handler exists').toBe(true);
    const { activatePendingShell } = await import('../src/renderer/pwa-update');
    const events = new EventTarget();
    let activated = false;
    let reloads = 0;
    const serviceWorkers = {
      getRegistration: async () => ({ waiting: { postMessage(message: { type: string }) { activated = message.type === 'SKIP_WAITING'; } } }),
      addEventListener: events.addEventListener.bind(events),
    };
    await activatePendingShell(serviceWorkers as unknown as ServiceWorkerContainer, () => { reloads++; });
    expect(activated).toBe(true);
    expect(reloads).toBe(0);
    events.dispatchEvent(new Event('controllerchange'));
    expect(reloads).toBe(1);
    events.dispatchEvent(new Event('controllerchange'));
    expect(reloads).toBe(1);
  });

  it('does not interrupt a form when a later shell starts waiting', async () => {
    expect(existsSync(path.resolve('src/renderer/pwa-update.ts')), 'startup update handler exists').toBe(true);
    const { activatePendingShell } = await import('../src/renderer/pwa-update');
    const events = new EventTarget();
    let reloads = 0;
    await activatePendingShell({ getRegistration: async () => ({ waiting: null }), addEventListener: events.addEventListener.bind(events) } as unknown as ServiceWorkerContainer, () => { reloads++; });
    events.dispatchEvent(new Event('controllerchange'));
    expect(reloads).toBe(0);
  });
});
