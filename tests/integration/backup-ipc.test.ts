import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMain } from 'electron';

const electronMock = vi.hoisted(() => ({
  showOpenDialog: vi.fn(), showMessageBox: vi.fn(), showSaveDialog: vi.fn(), relaunch: vi.fn(), exit: vi.fn(),
}));
vi.mock('electron', () => ({ app: { relaunch: electronMock.relaunch, exit: electronMock.exit }, dialog: electronMock }));

import { registerCatalogHandlers } from '../../src/main/ipc/register-handlers';

function handlersFor(backups: object, reports: object = {}, exports: object = {}, operationLock = { runExclusive: (fn: () => unknown) => fn() }) {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const ipcMain = {
    removeHandler: vi.fn(),
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown> | unknown) => {
      handlers.set(channel, async (...args) => handler(...args));
    }),
  } as unknown as IpcMain;
  registerCatalogHandlers(ipcMain, {} as never, {} as never, {} as never, reports as never, {} as never, exports as never, backups as never, operationLock as never);
  return handlers;
}

describe('backup IPC restore authorization', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns an opaque one-time token and asks main-process confirmation naming the picked backup', async () => {
    electronMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/private/backups/cart.sqlite'] });
    const events: string[] = [];
    electronMock.showMessageBox.mockImplementation(async () => { events.push('confirm'); return { response: 1 }; });
    const backups = { restoreBackup: vi.fn().mockImplementation(async () => { events.push('replace'); }) };
    const handlers = handlersFor(backups);
    const response = await handlers.get('backups:choose-file')!() as { ok: boolean; data: { token: string; fileName: string; filePath?: string } };
    expect(response.data.fileName).toBe('cart.sqlite');
    expect(response.data.filePath).toBeUndefined();
    const result = await handlers.get('backups:restore')!(null, response.data.token) as { ok: boolean; data?: boolean };
    expect(electronMock.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('cart.sqlite') }));
    expect(backups.restoreBackup).toHaveBeenCalledWith('/private/backups/cart.sqlite');
    expect(events).toEqual(['confirm', 'replace']);
    expect(result).toEqual({ ok: true, data: true });
  });

  it('consumes denied/canceled selections, rejects raw paths and reused tokens, and never restores', async () => {
    electronMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/private/backups/declined.sqlite'] });
    electronMock.showMessageBox.mockResolvedValue({ response: 0 });
    const backups = { restoreBackup: vi.fn() };
    const handlers = handlersFor(backups);
    const picked = await handlers.get('backups:choose-file')!() as { ok: boolean; data: { token: string } };
    await expect(handlers.get('backups:restore')!(null, '/private/backups/declined.sqlite')).resolves.toMatchObject({ ok: false });
    await expect(handlers.get('backups:restore')!(null, picked.data.token)).resolves.toEqual({ ok: true, data: false });
    await expect(handlers.get('backups:restore')!(null, picked.data.token)).resolves.toMatchObject({ ok: false });
    expect(electronMock.showMessageBox).toHaveBeenCalledOnce();
    expect(backups.restoreBackup).not.toHaveBeenCalled();
  });

  it('rejects CSV export after restore without reading the stale database connection', async () => {
    electronMock.showSaveDialog.mockResolvedValue({ canceled: true });
    const reports = { getProfitReport: vi.fn().mockReturnValue({ date: '2026-10-07', revenueCentavos: 0, costCentavos: 0, grossProfitCentavos: 0 }) };
    const exports = { reportToCsv: vi.fn().mockReturnValue('date,revenue\n') };
    const operationLock = { runExclusive: vi.fn((fn: () => unknown) => fn()) };
    const handlers = handlersFor({ isRestoreCommitted: true }, reports, exports, operationLock);
    const result = await handlers.get('reports:export-csv')!(null, { kind: 'profit', filter: { date: '2026-10-07' } });
    expect(result).toMatchObject({ ok: false, error: { code: 'RECOVERY_REQUIRED' } });
    expect(operationLock.runExclusive).toHaveBeenCalledOnce();
    expect(reports.getProfitReport).not.toHaveBeenCalled();
    expect(exports.reportToCsv).not.toHaveBeenCalled();
    expect(electronMock.showSaveDialog).not.toHaveBeenCalled();
  });
});
