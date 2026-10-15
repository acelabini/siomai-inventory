import 'fake-indexeddb/auto';
import { createBrowserDatabase, deleteBrowserDatabase } from '../../src/browser/db';

export function createTestDatabase() {
  const name = `siomai-test-${crypto.randomUUID()}`;
  const db = createBrowserDatabase(name);
  return {
    db,
    async cleanup() {
      db.close();
      await deleteBrowserDatabase(name);
    },
  };
}
