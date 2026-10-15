import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserInventoryApi } from '../../src/browser/browser-inventory-api';
import { createTestDatabase } from './test-database';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('browser API composition and runtime', () => {
  it('uses the supplied database for settings and asks for persistent storage once', async () => {
    const fixture = createTestDatabase();
    let requests = 0;
    const api = createBrowserInventoryApi({ db: fixture.db, persistStorage: async () => { requests++; return true; } });
    try {
      await api.saveSettings({ businessName: '  Cart  ' });
      expect(await api.getSettings()).toMatchObject({ businessName: 'Cart', runtime: 'web', automaticBackups: false, storagePersistent: true });
      expect((await fixture.db.settings.get('business_name'))?.value).toBe('Cart');
      await api.getSettings();
      expect(requests).toBe(1);
      expect(await api.chooseBackupDirectory()).toBeNull();
    } finally { await fixture.cleanup(); }
  });
  it('reports denied or unsupported persistence without an unhandled rejection', async () => {
    const fixture = createTestDatabase();
    try {
      const api = createBrowserInventoryApi({ db: fixture.db, persistStorage: async () => { throw new Error('denied'); } });
      expect(await api.getSettings()).toMatchObject({ runtime: 'web', storagePersistent: false });
    } finally { await fixture.cleanup(); }
  });
  it('preserves Electron when present, otherwise memoizes one browser API per page', async () => {
    const desktop = { getSettings: () => 'desktop' };
    vi.stubGlobal('window', { inventoryApi: desktop });
    const { getInventoryApi } = await import('../../src/renderer/api');
    expect(getInventoryApi()).toBe(desktop);
    vi.stubGlobal('window', {});
    const web = getInventoryApi();
    expect(web).toBeDefined();
    expect(getInventoryApi()).toBe(web);
    vi.stubGlobal('window', { inventoryApi: desktop });
    expect(getInventoryApi()).toBe(desktop);
  });
  it('reloads through the browser adapter after a successful restore workflow', async () => {
    const fixture = createTestDatabase();
    let reloads = 0;
    const api = createBrowserInventoryApi({ db: fixture.db, reload: () => { reloads++; } });
    try { await api.requestRelaunch(); expect(reloads).toBe(1); }
    finally { await fixture.cleanup(); }
  });
});
