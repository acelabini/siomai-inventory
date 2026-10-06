import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

export type BackupSettings = { businessName: string; backupDirectory: string };
export type BackupFile = { path: string; fileName: string };
export type BackupValidation = { valid: true; schemaVersion: number };

export class BackupError extends Error {
  constructor(readonly code: 'INVALID_BACKUP' | 'RESTORE_FAILED' | 'BACKUP_FAILED', message: string) {
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
  constructor(
    private readonly db: Database.Database,
    private readonly databasePath: string,
    private backupDirectory: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  getSettings(): BackupSettings {
    const rows = this.db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?)').all('business_name', 'backup_directory') as Array<{ key: string; value: string }>;
    const values = new Map(rows.map((row) => [row.key, row.value]));
    this.backupDirectory = values.get('backup_directory') ?? this.backupDirectory;
    return { businessName: values.get('business_name') ?? '', backupDirectory: this.backupDirectory };
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
    const backup = await this.writeSnapshot(path.join(this.backupDirectory, `safety-${stamp}.sqlite`));
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
      const tables = new Set((candidate.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all() as string[]));
      const requiredColumns: Record<string, string[]> = {
        settings: ['key', 'value'], locations: ['id', 'name', 'is_active'], products: ['id', 'sku', 'name', 'pieces_per_pack'],
        stock_movements: ['id', 'location_id', 'product_id', 'quantity_pieces', 'movement_type'], inventory_balances: ['location_id', 'product_id', 'quantity_pieces'],
        sales: ['id', 'location_id', 'business_at', 'total_centavos', 'status'], sale_lines: ['id', 'sale_id', 'product_id', 'quantity_pieces'],
        transfers: ['id', 'from_location_id', 'to_location_id', 'product_id', 'quantity_pieces'], stock_counts: ['id', 'location_id', 'counted_at'],
        stock_count_lines: ['id', 'stock_count_id', 'product_id', 'expected_pieces', 'counted_pieces'], backup_history: ['id', 'path', 'kind', 'status'],
        schema_migrations: ['version', 'name', 'applied_at'], replenishments: ['id', 'location_id', 'occurred_at'],
        replenishment_lines: ['id', 'replenishment_id', 'product_id', 'quantity_pieces'], opening_stock_records: ['location_id', 'product_id', 'quantity_pieces'],
        transfer_batches: ['id', 'from_location_id', 'to_location_id'],
      };
      for (const [table, expected] of Object.entries(requiredColumns)) {
        if (!tables.has(table)) throw new Error();
        const columns = new Set((candidate.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name));
        if (expected.some((column) => !columns.has(column))) throw new Error();
      }
      if (candidate.prepare('PRAGMA foreign_key_check').all().length) throw new Error();
      return { valid: true, schemaVersion: version };
    } catch {
      throw new BackupError('INVALID_BACKUP', 'This file is not a valid, compatible Siomai Inventory backup.');
    } finally { candidate?.close(); }
  }

  async restoreBackup(filePath: string): Promise<void> {
    this.validateBackup(filePath);
    const safety = await this.createOperationBackup();
    const directory = path.dirname(this.databasePath);
    const temporary = path.join(directory, `.restore-${randomUUID()}.sqlite`);
    const original = path.join(directory, `.restore-original-${randomUUID()}.sqlite`);
    let closed = false;
    let movedOriginal = false;
    try {
      mkdirSync(directory, { recursive: true });
      const restoreSource = new Database(filePath, { readonly: true, fileMustExist: true });
      try { await restoreSource.backup(temporary); }
      finally { restoreSource.close(); }
      this.db.close();
      closed = true;
      if (existsSync(this.databasePath)) {
        renameSync(this.databasePath, original);
        movedOriginal = true;
      }
      renameSync(temporary, this.databasePath);
      if (movedOriginal) rmSync(original, { force: true });
    } catch {
      try {
        if (existsSync(this.databasePath)) rmSync(this.databasePath, { force: true });
        if (movedOriginal && existsSync(original)) renameSync(original, this.databasePath);
        else if (closed) copyFileSync(safety.path, this.databasePath);
        if (existsSync(temporary)) rmSync(temporary, { force: true });
      } catch {
        throw new BackupError('RESTORE_FAILED', `Restore failed and recovery from safety backup ${safety.fileName} needs attention.`);
      }
      throw new BackupError('RESTORE_FAILED', closed
        ? 'The backup could not be restored. Your original data has been recovered from the safety backup.'
        : 'The backup could not be restored. Your original database remains in place.');
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
