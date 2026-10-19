import 'fake-indexeddb/auto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createBrowserDatabase, deleteBrowserDatabase } from '../src/browser/db';
import { createBrowserInventoryApi } from '../src/browser/browser-inventory-api';

describe('standalone PWA boundary', () => {
  it('builds and publishes the web artifact through GitHub Pages', () => {
    const workflowPath = path.resolve('.github/workflows/pages.yml');
    expect(existsSync(workflowPath), 'GitHub Pages workflow exists').toBe(true);
    const workflow = readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain('npm run build:web');
    expect(workflow).toContain('actions/upload-pages-artifact@v4');
    expect(workflow).toContain('path: dist/web');
    expect(workflow).toContain('actions/deploy-pages@v4');
    expect(workflow).toContain('pages: write');
    expect(workflow).toContain('id-token: write');
  });

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
      removeEventListener: events.removeEventListener.bind(events),
    };
    const decision = activatePendingShell(serviceWorkers as unknown as ServiceWorkerContainer, () => { reloads++; });
    await Promise.resolve();
    expect(activated).toBe(true);
    expect(reloads).toBe(0);
    events.dispatchEvent(new Event('controllerchange'));
    await decision;
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

  it('keeps interaction gated during a deferred startup lookup and renders safely after no waiting worker is found', async () => {
    const { bootstrapWebRenderer } = await import('../src/renderer/pwa-update');
    let resolveRegistration!: (registration: { waiting: null }) => void;
    const events = new EventTarget();
    const serviceWorkers = { getRegistration: () => new Promise((resolve) => { resolveRegistration = resolve; }), addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
    let interactive = false;
    let reloads = 0;
    const startup = bootstrapWebRenderer(serviceWorkers as unknown as ServiceWorkerContainer, () => { interactive = true; }, () => { reloads++; });
    await Promise.resolve();
    expect(interactive).toBe(false);
    resolveRegistration({ waiting: null });
    await startup;
    expect(interactive).toBe(true);
    events.dispatchEvent(new Event('controllerchange'));
    expect(reloads).toBe(0);
  });

  it('keeps interaction gated through delayed startup activation and reloads before rendering', async () => {
    const { bootstrapWebRenderer } = await import('../src/renderer/pwa-update');
    let resolveRegistration!: (registration: unknown) => void;
    const events = new EventTarget();
    let activated = false;
    let interactive = false;
    let reloads = 0;
    const serviceWorkers = { getRegistration: () => new Promise((resolve) => { resolveRegistration = resolve; }), addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
    const startup = bootstrapWebRenderer(serviceWorkers as unknown as ServiceWorkerContainer, () => { interactive = true; }, () => { reloads++; });
    expect(interactive).toBe(false);
    resolveRegistration({ waiting: { postMessage() { activated = true; } } });
    await Promise.resolve();
    expect(activated).toBe(true);
    expect(interactive).toBe(false);
    events.dispatchEvent(new Event('controllerchange'));
    await startup;
    expect(reloads).toBe(1);
    expect(interactive).toBe(false);
    await bootstrapWebRenderer({ getRegistration: async () => ({ waiting: null }) } as unknown as ServiceWorkerContainer, () => { interactive = true; }, () => { reloads++; });
    expect(interactive).toBe(true);
  });

  it('disarms a delayed startup decision before allowing interaction after its deadline', async () => {
    vi.useFakeTimers();
    try {
      const { bootstrapWebRenderer } = await import('../src/renderer/pwa-update');
      let resolveRegistration!: (registration: unknown) => void;
      let interactive = false;
      let reloads = 0;
      let activated = false;
      const startup = bootstrapWebRenderer({ getRegistration: () => new Promise((resolve) => { resolveRegistration = resolve; }) } as unknown as ServiceWorkerContainer, () => { interactive = true; }, () => { reloads++; });
      await vi.advanceTimersByTimeAsync(5000);
      await startup;
      expect(interactive).toBe(true);
      resolveRegistration({ waiting: { postMessage() { activated = true; } } });
      await Promise.resolve();
      expect(activated).toBe(false);
      expect(reloads).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('removes the activation listener before exposing forms when activation stalls', async () => {
    vi.useFakeTimers();
    try {
      const { bootstrapWebRenderer } = await import('../src/renderer/pwa-update');
      const events = new EventTarget();
      let interactive = false;
      let reloads = 0;
      const workers = { getRegistration: async () => ({ waiting: { postMessage() {} } }), addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
      const startup = bootstrapWebRenderer(workers as unknown as ServiceWorkerContainer, () => { interactive = true; }, () => { reloads++; });
      await Promise.resolve();
      expect(interactive).toBe(false);
      await vi.advanceTimersByTimeAsync(5000);
      await startup;
      expect(interactive).toBe(true);
      events.dispatchEvent(new Event('controllerchange'));
      expect(reloads).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
