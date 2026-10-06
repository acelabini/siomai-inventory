import { describe, expect, it, vi } from 'vitest';
import { BackupSelectionStore, restoreSelectedBackup } from '../../src/main/services/backup-authorization';

describe('backup restore authorization', () => {
  it('keeps the native picker path behind an opaque one-time token', async () => {
    const selections = new BackupSelectionStore();
    const selected = selections.add('/private/backups/cart.sqlite');
    expect(selected.fileName).toBe('cart.sqlite');
    expect(selected.token).not.toContain('cart.sqlite');
    const confirm = vi.fn().mockResolvedValue(true);
    const restore = vi.fn().mockResolvedValue(undefined);
    await expect(restoreSelectedBackup(selected.token, selections, confirm, restore)).resolves.toEqual({ restored: true });
    expect(confirm).toHaveBeenCalledWith('cart.sqlite');
    expect(restore).toHaveBeenCalledWith('/private/backups/cart.sqlite');
    await expect(restoreSelectedBackup(selected.token, selections, confirm, restore)).rejects.toThrow(/no longer valid/i);
    expect(restore).toHaveBeenCalledOnce();
  });

  it('consumes the token and performs no replacement when main-process confirmation is denied', async () => {
    const selections = new BackupSelectionStore();
    const selected = selections.add('/private/backups/declined.sqlite');
    const restore = vi.fn();
    await expect(restoreSelectedBackup(selected.token, selections, async () => false, restore)).resolves.toEqual({ restored: false });
    expect(restore).not.toHaveBeenCalled();
    await expect(restoreSelectedBackup(selected.token, selections, async () => true, restore)).rejects.toThrow(/no longer valid/i);
  });

  it('rejects unknown tokens without prompting or touching the database', async () => {
    const selections = new BackupSelectionStore();
    const confirm = vi.fn();
    const restore = vi.fn();
    await expect(restoreSelectedBackup('renderer-supplied-path', selections, confirm, restore)).rejects.toThrow(/no longer valid/i);
    expect(confirm).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
  });
});
