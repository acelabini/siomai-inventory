import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/db/database';
import { migrateDatabase } from '../../src/main/db/migrations';
import { BackupService } from '../../src/main/services/backup-service';
import { OperationLock } from '../../src/main/services/operation-lock';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(now = new Date('2026-10-07T16:30:00.000Z')) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'siomai-backups-'));
  roots.push(root);
  const dbPath = path.join(root, 'inventory.sqlite');
  const backupDir = path.join(root, 'backups');
  const db = openDatabase(dbPath);
  migrateDatabase(db);
  db.prepare("INSERT INTO settings (key, value) VALUES ('business_name', 'Cart ni Ate')").run();
  const service = new BackupService(db, dbPath, backupDir, () => now);
  return { root, dbPath, backupDir, db, service };
}

describe('BackupService', () => {
  it('creates at most one automatic startup backup per Manila calendar day', async () => {
    const { service, db, backupDir } = fixture();
    try {
      const first = await service.createAutomatic();
      const second = await service.createAutomatic();
      expect(first?.path).toContain('2026-10-08');
      expect(second).toBeNull();
      expect(readdirSync(backupDir)).toHaveLength(1);
    } finally { db.close(); }
  });

  it('keeps only the latest 30 automatic backups', async () => {
    const { service, db, backupDir } = fixture();
    try {
      mkdirSync(backupDir, { recursive: true });
      for (let day = 1; day <= 35; day += 1) {
        const date = `2026-09-${String(day).padStart(2, '0')}`;
        writeFileSync(path.join(backupDir, `automatic-${date}.sqlite`), String(day));
      }
      await service.pruneAutomaticBackups();
      const automatic = readdirSync(backupDir).filter((name) => name.startsWith('automatic-'));
      expect(automatic).toHaveLength(30);
      expect(automatic).toContain('automatic-2026-09-35.sqlite');
      expect(automatic).not.toContain('automatic-2026-09-01.sqlite');
    } finally { db.close(); }
  });

  it('creates a consistent SQLite backup of committed content', async () => {
    const { service, db, dbPath, backupDir } = fixture();
    try {
      const backup = await service.createManual(backupDir);
      const snapshot = openDatabase(backup.path);
      try {
        expect(snapshot.prepare("SELECT value FROM settings WHERE key = 'business_name'").pluck().get()).toBe('Cart ni Ate');
        expect(snapshot.pragma('integrity_check', { simple: true })).toBe('ok');
      } finally { snapshot.close(); }
      expect(readFileSync(dbPath).byteLength).toBeGreaterThan(0);
    } finally { db.close(); }
  });

  it('captures current content before an operation mutates the live database', async () => {
    const { service, db } = fixture();
    try {
      const safety = await service.createOperationBackup();
      db.prepare("UPDATE settings SET value = 'After import' WHERE key = 'business_name'").run();
      const snapshot = openDatabase(safety.path);
      try { expect(snapshot.prepare("SELECT value FROM settings WHERE key = 'business_name'").pluck().get()).toBe('Cart ni Ate'); }
      finally { snapshot.close(); }
    } finally { db.close(); }
  });

  it('rejects corrupt, foreign, and newer-schema backups without changing live data', async () => {
    const { service, db, dbPath, root } = fixture();
    try {
      const corrupt = path.join(root, 'corrupt.sqlite');
      const foreign = path.join(root, 'foreign.sqlite');
      const newer = path.join(root, 'newer.sqlite');
      writeFileSync(corrupt, 'not a sqlite database');
      const foreignDb = openDatabase(foreign);
      foreignDb.exec('CREATE TABLE unrelated (value TEXT)');
      foreignDb.close();
      const newerDb = openDatabase(newer);
      newerDb.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT)");
      newerDb.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(99, 'future');
      newerDb.close();
      for (const candidate of [corrupt, foreign, newer]) {
        await expect(service.restoreBackup(candidate)).rejects.toThrow();
        expect(db.open).toBe(true);
      }
      expect(db.prepare("SELECT value FROM settings WHERE key = 'business_name'").pluck().get()).toBe('Cart ni Ate');
      expect(readFileSync(dbPath).byteLength).toBeGreaterThan(0);
    } finally { db.close(); }
  });

  it('takes a pre-restore safety backup and restores the selected backup atomically', async () => {
    const { service, db, backupDir } = fixture();
    try {
      const restoreDir = path.join(path.dirname(backupDir), 'restore');
      const saved = await service.createManual(restoreDir);
      db.prepare("UPDATE settings SET value = 'Changed' WHERE key = 'business_name'").run();
      await service.restoreBackup(saved.path);
      expect(readdirSync(backupDir).some((name) => name.startsWith('safety-'))).toBe(true);
      expect(db.open).toBe(false);
      const restored = openDatabase(path.join(path.dirname(backupDir), 'inventory.sqlite'));
      try { expect(restored.prepare("SELECT value FROM settings WHERE key = 'business_name'").pluck().get()).toBe('Cart ni Ate'); }
      finally { restored.close(); }
    } finally { if (db.open) db.close(); }
  });

  it('restores committed content from a SQLite backup whose changes are still in its WAL', async () => {
    const { service, db, root } = fixture();
    const walPath = path.join(root, 'wal-backup.sqlite');
    const walDb = openDatabase(walPath);
    migrateDatabase(walDb);
    walDb.prepare("INSERT INTO settings (key, value) VALUES ('business_name', 'Committed in WAL')").run();
    try {
      await service.restoreBackup(walPath);
      const restored = openDatabase(path.join(root, 'inventory.sqlite'));
      try { expect(restored.prepare("SELECT value FROM settings WHERE key = 'business_name'").pluck().get()).toBe('Committed in WAL'); }
      finally { restored.close(); }
    } finally {
      walDb.close();
      if (db.open) db.close();
    }
  });
});

describe('OperationLock', () => {
  it('runs restore-sensitive operations exclusively and releases the lock after failures', async () => {
    const lock = new OperationLock();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const first = lock.runExclusive(async () => {
      order.push('first-start');
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      order.push('first-end');
    });
    const second = lock.runExclusive(() => { order.push('second'); throw new Error('expected'); });
    await Promise.resolve();
    expect(order).toEqual(['first-start']);
    releaseFirst();
    await first;
    await expect(second).rejects.toThrow('expected');
    const third = lock.runExclusive(() => { order.push('third'); return 3; });
    await expect(third).resolves.toBe(3);
    expect(order).toEqual(['first-start', 'first-end', 'second', 'third']);
  });
});
