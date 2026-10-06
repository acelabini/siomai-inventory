import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase } from './database';

export function createTestDatabase(): { db: ReturnType<typeof openDatabase>; cleanup: () => void } {
  const directory = mkdtempSync(path.join(tmpdir(), 'siomai-inventory-test-'));
  const databasePath = path.join(directory, 'inventory.sqlite');
  const db = openDatabase(databasePath);
  let cleaned = false;

  return {
    db,
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      db.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
