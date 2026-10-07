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
  'replenishments',
  'replenishment_lines',
  'opening_stock_records',
  'transfer_batches',
];

const fractionalIntegerColumns = [
  ['products', 'pieces_per_pack'],
  ['products', 'purchase_cost_per_pack_centavos'],
  ['products', 'selling_price_per_piece_centavos'],
  ['products', 'selling_price_per_pack_centavos'],
  ['products', 'low_stock_threshold_pieces'],
  ['stock_movements', 'quantity_pieces'],
  ['inventory_balances', 'quantity_pieces'],
  ['sales', 'total_centavos'],
  ['sales', 'payment_centavos'],
  ['sales', 'change_centavos'],
  ['sale_lines', 'quantity_pieces'],
  ['sale_lines', 'unit_selling_price_centavos'],
  ['sale_lines', 'unit_cost_centavos'],
  ['sale_lines', 'line_revenue_centavos'],
  ['sale_lines', 'line_cost_centavos'],
  ['transfers', 'quantity_pieces'],
  ['stock_count_lines', 'expected_pieces'],
  ['stock_count_lines', 'counted_pieces'],
] as const;

function seedDatabase(db: ReturnType<typeof createTestDatabase>['db']): void {
  db.prepare("INSERT INTO locations (id, name) VALUES ('loc-1', 'Cart 1'), ('loc-2', 'Cart 2')").run();
  db.prepare(`
    INSERT INTO products (
      id, sku, name, pieces_per_pack, purchase_cost_per_pack_centavos,
      selling_price_per_piece_centavos, selling_price_per_pack_centavos,
      low_stock_threshold_pieces
    ) VALUES ('product-1', 'SKU-1', 'Siomai', 10, 5000, 600, 6000, 5)
  `).run();
  db.prepare(`
    INSERT INTO stock_movements (id, location_id, product_id, quantity_pieces, movement_type)
    VALUES ('movement-1', 'loc-1', 'product-1', 1, 'opening_balance')
  `).run();
  db.prepare(`
    INSERT INTO inventory_balances (location_id, product_id, quantity_pieces)
    VALUES ('loc-1', 'product-1', 1)
  `).run();
  db.prepare(`
    INSERT INTO sales (id, location_id, business_at, total_centavos, payment_centavos, change_centavos)
    VALUES ('sale-1', 'loc-1', '2026-10-07', 600, 1000, 400)
  `).run();
  db.prepare(`
    INSERT INTO sale_lines (
      id, sale_id, product_id, quantity_pieces, entered_unit, entered_quantity,
      unit_selling_price_centavos, unit_cost_centavos, line_revenue_centavos, line_cost_centavos
    ) VALUES ('line-1', 'sale-1', 'product-1', 1, 'piece', '1', 600, 500, 600, 500)
  `).run();
  db.prepare(`
    INSERT INTO transfers (id, from_location_id, to_location_id, product_id, quantity_pieces)
    VALUES ('transfer-1', 'loc-1', 'loc-2', 'product-1', 1)
  `).run();
  db.prepare("INSERT INTO stock_counts (id, location_id) VALUES ('count-1', 'loc-1'), ('count-2', 'loc-1')").run();
  db.prepare(`
    INSERT INTO stock_count_lines (id, stock_count_id, product_id, expected_pieces, counted_pieces)
    VALUES ('count-line-1', 'count-1', 'product-1', 1, 1)
  `).run();
}

function insertFractionalValue(
  db: ReturnType<typeof createTestDatabase>['db'],
  table: (typeof fractionalIntegerColumns)[number][0],
  column: (typeof fractionalIntegerColumns)[number][1],
): void {
  let columns: string[];
  let values: (string | number)[];

  switch (table) {
    case 'products':
      columns = [
        'id', 'sku', 'name', 'pieces_per_pack', 'purchase_cost_per_pack_centavos',
        'selling_price_per_piece_centavos', 'selling_price_per_pack_centavos',
        'low_stock_threshold_pieces',
      ];
      values = ['product-2', 'SKU-2', 'Dumpling', 10, 5000, 600, 6000, 5];
      break;
    case 'stock_movements':
      columns = ['id', 'location_id', 'product_id', 'quantity_pieces', 'movement_type'];
      values = ['movement-2', 'loc-1', 'product-1', 1, 'opening_balance'];
      break;
    case 'inventory_balances':
      columns = ['location_id', 'product_id', 'quantity_pieces'];
      values = ['loc-2', 'product-1', 1];
      break;
    case 'sales':
      columns = [
        'id', 'location_id', 'business_at', 'total_centavos',
        'payment_centavos', 'change_centavos',
      ];
      values = ['sale-2', 'loc-1', '2026-10-07', 600, 1000, 400];
      break;
    case 'sale_lines':
      columns = [
        'id', 'sale_id', 'product_id', 'quantity_pieces', 'entered_unit',
        'entered_quantity', 'unit_selling_price_centavos', 'unit_cost_centavos',
        'line_revenue_centavos', 'line_cost_centavos',
      ];
      values = ['line-2', 'sale-1', 'product-1', 1, 'piece', '1', 600, 500, 600, 500];
      break;
    case 'transfers':
      columns = ['id', 'from_location_id', 'to_location_id', 'product_id', 'quantity_pieces'];
      values = ['transfer-2', 'loc-1', 'loc-2', 'product-1', 1];
      break;
    case 'stock_count_lines':
      columns = [
        'id', 'stock_count_id', 'product_id', 'expected_pieces', 'counted_pieces',
      ];
      values = ['count-line-2', 'count-2', 'product-1', 1, 1];
      break;
    default:
      throw new Error(`No fractional insert fixture for ${table}`);
  }

  const targetIndex = columns.indexOf(column);
  if (targetIndex < 0) throw new Error(`No ${table}.${column} insert fixture`);
  values[targetIndex] = 1.5;

  const placeholders = columns.map(() => '?').join(', ');
  db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`).run(...values);
}

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
      expect(db.prepare('SELECT version FROM schema_migrations').pluck().all()).toHaveLength(3);
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
      expect(db.prepare('SELECT version FROM schema_migrations').pluck().all()).toHaveLength(3);
    } finally {
      cleanup();
    }
  });

  it('allows a sale to retain multiple input lines for the same product', () => {
    const { db, cleanup } = createTestDatabase();
    try {
      migrateDatabase(db);
      seedDatabase(db);
      db.prepare(`INSERT INTO sale_lines (
        id, sale_id, product_id, quantity_pieces, entered_unit, entered_quantity,
        unit_selling_price_centavos, unit_cost_centavos, line_revenue_centavos, line_cost_centavos
      ) VALUES ('line-2', 'sale-1', 'product-1', 2, 'piece', '2', 600, 500, 1200, 1000)`).run();
      expect(db.prepare('SELECT id FROM sale_lines WHERE sale_id = ? ORDER BY id').pluck().all('sale-1')).toEqual(['line-1', 'line-2']);
    } finally {
      cleanup();
    }
  });

  it('preserves existing sale line snapshots while rebuilding the version 2 schema', () => {
    const { db, cleanup } = createTestDatabase();
    try {
      migrateDatabase(db);
      seedDatabase(db);
      db.exec(`
        CREATE TABLE sale_lines_v2 (
          id TEXT PRIMARY KEY,
          sale_id TEXT NOT NULL REFERENCES sales(id),
          product_id TEXT NOT NULL REFERENCES products(id),
          quantity_pieces INTEGER NOT NULL CHECK (typeof(quantity_pieces) = 'integer' AND quantity_pieces > 0),
          entered_unit TEXT NOT NULL CHECK (entered_unit IN ('piece', 'pack')),
          entered_quantity TEXT NOT NULL,
          unit_selling_price_centavos INTEGER NOT NULL CHECK (typeof(unit_selling_price_centavos) = 'integer' AND unit_selling_price_centavos >= 0),
          unit_cost_centavos INTEGER NOT NULL CHECK (typeof(unit_cost_centavos) = 'integer' AND unit_cost_centavos >= 0),
          line_revenue_centavos INTEGER NOT NULL CHECK (typeof(line_revenue_centavos) = 'integer' AND line_revenue_centavos >= 0),
          line_cost_centavos INTEGER NOT NULL CHECK (typeof(line_cost_centavos) = 'integer' AND line_cost_centavos >= 0),
          UNIQUE (sale_id, product_id)
        );
        INSERT INTO sale_lines_v2 SELECT * FROM sale_lines;
        DROP TABLE sale_lines;
        ALTER TABLE sale_lines_v2 RENAME TO sale_lines;
        DELETE FROM schema_migrations WHERE version = 3;
      `);

      migrateDatabase(db);

      expect(db.prepare('SELECT * FROM sale_lines WHERE id = ?').get('line-1')).toMatchObject({
        id: 'line-1', sale_id: 'sale-1', product_id: 'product-1', quantity_pieces: 1n,
        entered_unit: 'piece', entered_quantity: '1', unit_selling_price_centavos: 600n,
        unit_cost_centavos: 500n, line_revenue_centavos: 600n, line_cost_centavos: 500n,
      });
      expect(db.pragma('foreign_key_check')).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it.each(fractionalIntegerColumns)(
    'rejects a fractional value in %s.%s',
    (table, column) => {
      const { db, cleanup } = createTestDatabase();
      try {
        migrateDatabase(db);
        seedDatabase(db);

        expect(() => insertFractionalValue(db, table, column)).toThrow();
      } finally {
        cleanup();
      }
    },
  );
});
