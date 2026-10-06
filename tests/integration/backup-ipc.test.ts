import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMain } from 'electron';

const electronMock = vi.hoisted(() => ({
  showOpenDialog: vi.fn(), showMessageBox: vi.fn(), relaunch: vi.fn(), exit: vi.fn(),
}));
vi.mock('electron', () => ({ app: { relaunch: electronMock.relaunch, exit: electronMock.exit }, dialog: electronMock }));

import { registerCatalogHandlers } from '../../src/main/ipc/register-handlers';

function handlersFor(backups: object) {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const ipcMain = {
    removeHandler: vi.fn(),
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown> | unknown) => {
      handlers.set(channel, async (...args) => handler(...args));
    }),
  } as unknown as IpcMain;
  registerCatalogHandlers(ipcMain, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, backups as never, { runExclusive: (fn: () => unknown) => fn() } as never);
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
});
