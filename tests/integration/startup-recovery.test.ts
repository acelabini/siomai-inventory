import { describe, expect, it, vi } from 'vitest';
import { OperationLock } from '../../src/main/services/operation-lock';
import { initializeAppDatabase } from '../../src/main/services/startup-recovery';

describe('initializeAppDatabase', () => {
  it('continues to app readiness with a recoverable warning if the daily backup fails', async () => {
    const events: string[] = [];
    const backups = {
      createOperationBackup: vi.fn().mockResolvedValue({ path: '/safe.sqlite', fileName: 'safe.sqlite' }),
      createAutomatic: vi.fn().mockRejectedValue(new Error('disk is full')),
      setStartupWarning: vi.fn(),
    };
    let warning: string | null = null;
    await initializeAppDatabase({
      existingDatabase: true,
      backups,
      operationLock: new OperationLock(),
      migrate: () => events.push('migrate'),
      onReady: (value) => { warning = value; events.push('window-ready'); },
    });
    expect(events).toEqual(['migrate', 'window-ready']);
    expect(warning).toMatch(/automatic startup backup/i);
    expect(backups.setStartupWarning).toHaveBeenCalledWith(warning);
  });

  it('does not run migrations or open the app if safety backup and fallback protection fail', async () => {
    const onReady = vi.fn();
    const migrate = vi.fn();
    await expect(initializeAppDatabase({
      existingDatabase: true,
      backups: {
        createOperationBackup: vi.fn().mockRejectedValue(new Error('no safe copy available')),
        createAutomatic: vi.fn(),
        setStartupWarning: vi.fn(),
      },
      operationLock: new OperationLock(),
      migrate,
      onReady,
    })).rejects.toThrow('no safe copy available');
    expect(migrate).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });
});
