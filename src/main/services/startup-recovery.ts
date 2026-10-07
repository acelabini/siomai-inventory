import type { BackupService } from './backup-service';
import type { OperationLock } from './operation-lock';

export async function initializeAppDatabase(input: {
  existingDatabase: boolean;
  backups: Pick<BackupService, 'createOperationBackup' | 'createAutomatic' | 'setStartupWarning'>;
  operationLock: OperationLock;
  migrate: () => void;
  onReady: (warning: string | null) => void;
}): Promise<string | null> {
  return input.operationLock.runExclusive(async () => {
    if (input.existingDatabase) await input.backups.createOperationBackup();
    input.migrate();
    let warning: string | null = null;
    try { await input.backups.createAutomatic(); }
    catch { warning = 'The automatic startup backup could not be created. Create a manual backup or check the backup folder.'; }
    input.backups.setStartupWarning(warning);
    input.onReady(warning);
    return warning;
  });
}
