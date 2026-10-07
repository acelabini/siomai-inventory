import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { BackupError } from './backup-service';

type BackupSelection = { filePath: string; fileName: string };

export class BackupSelectionStore {
  private readonly selections = new Map<string, BackupSelection>();

  add(filePath: string): { token: string; fileName: string } {
    const token = randomUUID();
    const fileName = path.basename(filePath);
    this.selections.set(token, { filePath, fileName });
    return { token, fileName };
  }

  consume(token: string): BackupSelection {
    const selection = this.selections.get(token);
    this.selections.delete(token);
    if (!selection) throw new BackupError('INVALID_BACKUP', 'The selected backup is no longer valid. Choose it again.');
    return selection;
  }
}

export async function restoreSelectedBackup(
  token: string,
  selections: BackupSelectionStore,
  confirm: (fileName: string) => boolean | Promise<boolean>,
  restore: (filePath: string) => void | Promise<void>,
): Promise<{ restored: boolean }> {
  const selection = selections.consume(token);
  if (!await confirm(selection.fileName)) return { restored: false };
  await restore(selection.filePath);
  return { restored: true };
}
