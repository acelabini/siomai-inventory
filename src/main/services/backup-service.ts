import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { migrateDatabase } from '../db/migrations';

export type BackupSettings = { businessName: string; backupDirectory: string; startupWarning: string | null };
export type BackupFile = { path: string; fileName: string };
export type BackupValidation = { valid: true; schemaVersion: number };
export type BackupServiceOptions = {
  recoveryBackupDirectory?: string;
  replaceDatabase?: (preparedPath: string, livePath: string) => void;
};

export class BackupError extends Error {
  constructor(readonly code: 'INVALID_BACKUP' | 'RESTORE_FAILED' | 'BACKUP_FAILED' | 'RECOVERY_REQUIRED', message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

function manilaDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export class BackupService {
  private readonly recoveryBackupDirectory: string;
  private readonly replaceDatabase: (preparedPath: string, livePath: string) => void;
  private startupWarning: string | null = null;
  private restoreCommitted = false;

  constructor(
    private readonly db: Database.Database,
    private readonly databasePath: string,
    private backupDirectory: string,
    private readonly clock: () => Date = () => new Date(),
    options: BackupServiceOptions = {},
  ) {
    this.recoveryBackupDirectory = options.recoveryBackupDirectory ?? path.join(path.dirname(databasePath), 'recovery-backups');
    this.replaceDatabase = options.replaceDatabase ?? ((preparedPath, livePath) => renameSync(preparedPath, livePath));
  }

  get isRestoreCommitted(): boolean { return this.restoreCommitted; }

  setStartupWarning(warning: string | null): void { this.startupWarning = warning; }

  getSettings(): BackupSettings {
    const rows = this.db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?)').all('business_name', 'backup_directory') as Array<{ key: string; value: string }>;
    const values = new Map(rows.map((row) => [row.key, row.value]));
    this.backupDirectory = values.get('backup_directory') ?? this.backupDirectory;
    return { businessName: values.get('business_name') ?? '', backupDirectory: this.backupDirectory, startupWarning: this.startupWarning };
  }

  saveSettings(businessName: string): { businessName: string } {
    this.db.prepare("INSERT INTO settings (key, value) VALUES ('business_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(businessName.trim());
    return { businessName: businessName.trim() };
  }

  setBackupDirectory(directory: string): string {
    this.backupDirectory = directory;
    this.db.prepare("INSERT INTO settings (key, value) VALUES ('backup_directory', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(directory);
    return directory;
  }

  async createAutomatic(): Promise<BackupFile | null> {
    const day = manilaDate(this.clock());
    const fileName = `automatic-${day}.sqlite`;
    const destination = path.join(this.backupDirectory, fileName);
    if (existsSync(destination)) return null;
    const backup = await this.writeSnapshot(destination);
    this.record(backup.path, 'automatic');
    await this.pruneAutomaticBackups();
    return backup;
  }

  async createManual(directory = this.backupDirectory): Promise<BackupFile> {
    const stamp = `${this.clock().toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${randomUUID()}`;
    const backup = await this.writeSnapshot(path.join(directory, `manual-${stamp}.sqlite`));
    this.record(backup.path, 'manual');
    return backup;
  }

  async createOperationBackup(): Promise<BackupFile> {
    const stamp = `${manilaDate(this.clock())}-${randomUUID()}`;
    let backup: BackupFile;
    try { backup = await this.writeSnapshot(path.join(this.backupDirectory, `safety-${stamp}.sqlite`)); }
    catch { backup = await this.writeSnapshot(path.join(this.recoveryBackupDirectory, `safety-${stamp}.sqlite`)); }
    this.record(backup.path, 'safety');
    return backup;
  }

  validateBackup(filePath: string): BackupValidation {
    let candidate: Database.Database | undefined;
    try {
      if (!existsSync(filePath) || statSync(filePath).size === 0) throw new Error();
      candidate = new Database(filePath, { readonly: true, fileMustExist: true });
      if (candidate.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error();
      const migrations = candidate.prepare("SELECT version FROM schema_migrations ORDER BY version").pluck().all() as number[];
      const versions = migrations.map(Number);
      const version = versions.length ? Math.max(...versions) : 0;
      if (version !== 3 || versions.join(',') !== '1,2,3') throw new Error();
      const reference = new Database(':memory:');
      try {
        migrateDatabase(reference);
        const signature = (db: Database.Database) => db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
        if (JSON.stringify(signature(candidate)) !== JSON.stringify(signature(reference))) throw new Error();
      } finally { reference.close(); }
      if (candidate.prepare('PRAGMA foreign_key_check').all().length) throw new Error();
      return { valid: true, schemaVersion: version };
    } catch {
      throw new BackupError('INVALID_BACKUP', 'This file is not a valid, compatible Siomai Inventory backup.');
    } finally { candidate?.close(); }
  }

  async restoreBackup(filePath: string): Promise<void> {
    if (this.restoreCommitted) throw new BackupError('RECOVERY_REQUIRED', 'The restored database is ready. Relaunch the application to continue.');
    this.validateBackup(filePath);
    const safety = await this.createOperationBackup();
    const directory = path.dirname(this.databasePath);
    const temporary = path.join(directory, `.restore-${randomUUID()}.sqlite`);
    try {
      mkdirSync(directory, { recursive: true });
      const restoreSource = new Database(filePath, { readonly: true, fileMustExist: true });
      try { await restoreSource.backup(temporary); }
      finally { restoreSource.close(); }
      this.validateBackup(temporary);
      this.db.pragma('wal_checkpoint(TRUNCATE)');
      this.db.pragma('journal_mode = DELETE');
      this.replaceDatabase(temporary, this.databasePath);
      this.restoreCommitted = true;
    } catch {
      try {
        if (existsSync(temporary)) rmSync(temporary, { force: true });
      } catch {
        throw new BackupError('RESTORE_FAILED', `Restore failed and recovery from safety backup ${safety.fileName} needs attention.`);
      }
      throw new BackupError('RESTORE_FAILED', 'The backup could not be restored. Your original database remains in place, and its safety backup is available.');
    }
  }

  pruneAutomaticBackups(): void {
    if (!existsSync(this.backupDirectory)) return;
    const files = readdirSync(this.backupDirectory)
      .filter((name) => /^automatic-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name))
      .sort();
    for (const name of files.slice(0, Math.max(0, files.length - 30))) rmSync(path.join(this.backupDirectory, name), { force: true });
  }

  private async writeSnapshot(destination: string): Promise<BackupFile> {
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      mkdirSync(path.dirname(destination), { recursive: true });
      await this.db.backup(temporary);
      renameSync(temporary, destination);
      return { path: destination, fileName: path.basename(destination) };
    } catch {
      rmSync(temporary, { force: true });
      throw new BackupError('BACKUP_FAILED', 'The database backup could not be created.');
    }
  }

  private record(filePath: string, kind: string): void {
    if (!this.db.open) return;
    const exists = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'backup_history'").get();
    if (!exists) return;
    this.db.prepare('INSERT INTO backup_history (id, path, kind, created_at, status) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), filePath, kind, this.clock().toISOString(), 'complete');
  }
}
