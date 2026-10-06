import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../src/main/db/test-database';
import { migrateDatabase } from '../../src/main/db/migrations';

const requiredTables = [
  'settings',
  'locations',
  'products',
  'stock_movements',
  'inventory_balances',
  'sales',
  'sale_lines',
  'transfers',
  'stock_counts',
  'stock_count_lines',
  'schema_migrations',
  'backup_history',
];

describe('database migrations', () => {
  it('creates the inventory schema with foreign keys enabled', () => {
    const { db, cleanup } = createTestDatabase();
    try {
      migrateDatabase(db);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .pluck()
        .all();
      expect(tables).toEqual(expect.arrayContaining(requiredTables));
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1n);
      expect(db.prepare('SELECT version FROM schema_migrations').pluck().all()).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it('does not reapply a migration when run again', () => {
    const { db, cleanup } = createTestDatabase();
    try {
      migrateDatabase(db);
      db.prepare("INSERT INTO settings (key, value) VALUES ('theme', 'light')").run();

      migrateDatabase(db);

      expect(db.prepare('SELECT value FROM settings WHERE key = ?').pluck().get('theme')).toBe('light');
      expect(db.prepare('SELECT version FROM schema_migrations').pluck().all()).toHaveLength(1);
    } finally {
      cleanup();
    }
  });
});
