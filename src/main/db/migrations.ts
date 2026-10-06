import type Database from 'better-sqlite3';

type Migration = {
  version: number;
  name: string;
  sql: string;
};

const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_inventory_schema',
    sql: `
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE locations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        sku TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        pieces_per_pack INTEGER NOT NULL CHECK (typeof(pieces_per_pack) = 'integer' AND pieces_per_pack > 0),
        purchase_cost_per_pack_centavos INTEGER NOT NULL CHECK (typeof(purchase_cost_per_pack_centavos) = 'integer' AND purchase_cost_per_pack_centavos >= 0),
        selling_price_per_piece_centavos INTEGER NOT NULL CHECK (typeof(selling_price_per_piece_centavos) = 'integer' AND selling_price_per_piece_centavos >= 0),
        selling_price_per_pack_centavos INTEGER NOT NULL CHECK (typeof(selling_price_per_pack_centavos) = 'integer' AND selling_price_per_pack_centavos >= 0),
        low_stock_threshold_pieces INTEGER NOT NULL DEFAULT 0 CHECK (typeof(low_stock_threshold_pieces) = 'integer' AND low_stock_threshold_pieces >= 0),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE stock_movements (
        id TEXT PRIMARY KEY,
        location_id TEXT NOT NULL REFERENCES locations(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        quantity_pieces INTEGER NOT NULL CHECK (typeof(quantity_pieces) = 'integer' AND quantity_pieces <> 0),
        movement_type TEXT NOT NULL,
        occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        related_entity_type TEXT,
        related_entity_id TEXT,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE inventory_balances (
        location_id TEXT NOT NULL REFERENCES locations(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        quantity_pieces INTEGER NOT NULL DEFAULT 0 CHECK (typeof(quantity_pieces) = 'integer' AND quantity_pieces >= 0),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (location_id, product_id)
      );

      CREATE TABLE sales (
        id TEXT PRIMARY KEY,
        location_id TEXT NOT NULL REFERENCES locations(id),
        business_at TEXT NOT NULL,
        total_centavos INTEGER NOT NULL CHECK (typeof(total_centavos) = 'integer' AND total_centavos >= 0),
        payment_centavos INTEGER NOT NULL CHECK (typeof(payment_centavos) = 'integer' AND payment_centavos >= 0),
        change_centavos INTEGER NOT NULL CHECK (typeof(change_centavos) = 'integer' AND change_centavos >= 0),
        note TEXT,
        status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE sale_lines (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL REFERENCES sales(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        quantity_pieces INTEGER NOT NULL CHECK (typeof(quantity_pieces) = 'integer' AND quantity_pieces > 0),
        entered_unit TEXT NOT NULL CHECK (entered_unit IN ('piece', 'pack')),
        entered_quantity TEXT NOT NULL,
        unit_selling_price_centavos INTEGER NOT NULL CHECK (typeof(unit_selling_price_centavos) = 'integer' AND unit_selling_price_centavos >= 0),
        unit_cost_centavos INTEGER NOT NULL CHECK (typeof(unit_cost_centavos) = 'integer' AND unit_cost_centavos >= 0),
        line_revenue_centavos INTEGER NOT NULL CHECK (typeof(line_revenue_centavos) = 'integer' AND line_revenue_centavos >= 0),
        line_cost_centavos INTEGER NOT NULL CHECK (typeof(line_cost_centavos) = 'integer' AND line_cost_centavos >= 0)
      );

      CREATE TABLE transfers (
        id TEXT PRIMARY KEY,
        from_location_id TEXT NOT NULL REFERENCES locations(id),
        to_location_id TEXT NOT NULL REFERENCES locations(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        quantity_pieces INTEGER NOT NULL CHECK (typeof(quantity_pieces) = 'integer' AND quantity_pieces > 0),
        occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (from_location_id <> to_location_id)
      );

      CREATE TABLE stock_counts (
        id TEXT PRIMARY KEY,
        location_id TEXT NOT NULL REFERENCES locations(id),
        counted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE stock_count_lines (
        id TEXT PRIMARY KEY,
        stock_count_id TEXT NOT NULL REFERENCES stock_counts(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        expected_pieces INTEGER NOT NULL CHECK (typeof(expected_pieces) = 'integer' AND expected_pieces >= 0),
        counted_pieces INTEGER NOT NULL CHECK (typeof(counted_pieces) = 'integer' AND counted_pieces >= 0),
        note TEXT,
        UNIQUE (stock_count_id, product_id)
      );

      CREATE TABLE backup_history (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        kind TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'complete'
      );
    `,
  },
];

export function migrateDatabase(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }).immediate();

  const appliedVersions = new Set(
    (db.prepare('SELECT version FROM schema_migrations').pluck().all() as bigint[]).map(Number),
  );

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;

    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
        migration.version,
        migration.name,
      );
    }).immediate();
  }
}
