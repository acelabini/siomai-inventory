import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { devices, test as base } from '@playwright/test';
import { preview } from 'vite';

type WebServer = { origin: string; stop: () => Promise<void> };

export const test = base.extend<{ webServer: WebServer }>({
  webServer: async ({ context }, use) => {
    await context.setOffline(false);
    // Port zero reserves an unused port atomically. Never reuse a developer's server.
    const server = await preview({
      configFile: path.resolve('vite.web.config.ts'),
      preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false },
    });
    const stop = async () => {
      if (!server.httpServer.listening) return;
      await new Promise<void>((resolve, reject) => {
        server.httpServer.close((error) => error ? reject(error) : resolve());
        if ('closeAllConnections' in server.httpServer) server.httpServer.closeAllConnections();
      });
    };
    try {
      const address = server.httpServer.address();
      if (!address || typeof address === 'string') throw new Error('Preview did not bind a loopback port');
      await use({ origin: `http://127.0.0.1:${address.port}`, stop });
    }
    finally { await stop(); }
  },
  context: async ({ playwright }, use) => {
    const profile = await mkdtemp(path.join(os.tmpdir(), 'siomai-web-e2e-'));
    const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices['iPhone 14'];
    try {
      const context = await playwright.chromium.launchPersistentContext(profile, {
        viewport, deviceScaleFactor, isMobile, hasTouch, userAgent,
        headless: true, serviceWorkers: 'allow', timezoneId: 'Asia/Manila',
      });
      try {
        for (const initialPage of context.pages()) await initialPage.close();
        await use(context);
      }
      finally { await context.close(); }
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  },
});
