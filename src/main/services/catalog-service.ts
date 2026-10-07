import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  completeSetupSchema,
  saveLocationSchema,
  saveProductSchema,
  type CatalogLocation,
  type CatalogProduct,
  type CompleteSetupInput,
  type SaveLocationInput,
  type SaveProductInput,
  type SetupState,
} from '../../shared/schemas';

export type CatalogErrorCode =
  | 'INVALID_INPUT'
  | 'DUPLICATE_SKU'
  | 'DUPLICATE_LOCATION'
  | 'NOT_FOUND'
  | 'LAST_ACTIVE_LOCATION'
  | 'SETUP_ALREADY_COMPLETE'
  | 'INVALID_SAMPLE_PRODUCT';

export class CatalogError extends Error {
  constructor(readonly code: CatalogErrorCode, message: string) {
    super(message);
    this.name = 'CatalogError';
  }
}

type SampleProduct = Omit<CatalogProduct, 'lowStockThresholdPieces' | 'isActive'>;

const sampleProducts: readonly SampleProduct[] = [
  { id: 'siomai-pork', sku: 'SIO-PORK', name: 'Siomai Pork', piecesPerPack: 66, purchaseCostPerPackCentavos: 14600, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0 },
  { id: 'siomai-beef', sku: 'SIO-BEEF', name: 'Siomai Beef', piecesPerPack: 60, purchaseCostPerPackCentavos: 14000, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0 },
  { id: 'siomai-japanese', sku: 'SIO-JAPANESE', name: 'Siomai Japanese', piecesPerPack: 30, purchaseCostPerPackCentavos: 9500, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0 },
  { id: 'big-siomai-pork', sku: 'BIG-PORK', name: 'Big Siomai Pork', piecesPerPack: 20, purchaseCostPerPackCentavos: 11000, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0 },
  { id: 'big-siomai-japanese', sku: 'BIG-JAPANESE', name: 'Big Siomai Japanese', piecesPerPack: 20, purchaseCostPerPackCentavos: 14800, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0 },
];

type ProductRow = {
  id: string; sku: string; name: string; pieces_per_pack: number | bigint;
  purchase_cost_per_pack_centavos: number | bigint;
  selling_price_per_piece_centavos: number | bigint;
  selling_price_per_pack_centavos: number | bigint;
  low_stock_threshold_pieces: number | bigint; is_active: number | bigint;
};

type LocationRow = { id: string; name: string; is_active: number | bigint };

function mapProduct(row: ProductRow): CatalogProduct {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    piecesPerPack: Number(row.pieces_per_pack),
    purchaseCostPerPackCentavos: Number(row.purchase_cost_per_pack_centavos),
    sellingPricePerPieceCentavos: Number(row.selling_price_per_piece_centavos),
    sellingPricePerPackCentavos: Number(row.selling_price_per_pack_centavos),
    lowStockThresholdPieces: Number(row.low_stock_threshold_pieces),
    isActive: Number(row.is_active) === 1,
  };
}

function mapLocation(row: LocationRow): CatalogLocation {
  return { id: row.id, name: row.name, isActive: Number(row.is_active) === 1 };
}

function invalidInput(error: unknown): never {
  if (error instanceof CatalogError) throw error;
  throw new CatalogError('INVALID_INPUT', 'The catalog details are invalid. Check the fields and try again.');
}

function translateDatabaseError(error: unknown): never {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('UNIQUE constraint failed: products.sku')) {
    throw new CatalogError('DUPLICATE_SKU', 'That SKU is already in use.');
  }
  if (message.includes('UNIQUE constraint failed: locations.name')) {
    throw new CatalogError('DUPLICATE_LOCATION', 'That location name is already in use.');
  }
  throw new CatalogError('INVALID_INPUT', 'The catalog change could not be saved. Check the details and try again.');
}

export class CatalogService {
  constructor(private readonly db: Database.Database) {}

  getSetupState(): SetupState {
    const settings = this.db.prepare("SELECT value FROM settings WHERE key = 'business_name'").pluck().get() as string | undefined;
    const complete = this.db.prepare("SELECT value FROM settings WHERE key = 'setup_complete'").pluck().get() === 'true';
    return {
      complete,
      businessName: settings ?? null,
      locations: this.listLocations(),
      sampleProducts: sampleProducts.map((product) => ({
        ...product, lowStockThresholdPieces: 0, isActive: true,
      })),
    };
  }

  completeSetup(input: CompleteSetupInput): { complete: true; businessName: string; locationId: string } {
    let data: CompleteSetupInput;
    try {
      data = completeSetupSchema.parse(input);
      if (new Set(data.sampleProductIds).size !== data.sampleProductIds.length) {
        throw new CatalogError('INVALID_INPUT', 'Select each sample product only once.');
      }
    } catch (error) {
      invalidInput(error);
    }

    const samplesById = new Map(sampleProducts.map((product) => [product.id, product]));
    if (data.sampleProductIds.some((id) => !samplesById.has(id))) {
      throw new CatalogError('INVALID_SAMPLE_PRODUCT', 'One or more sample products are unavailable.');
    }
    const openingStock = new Map<string, number>();
    for (const item of data.openingStock) {
      if (openingStock.has(item.productId) || !data.sampleProductIds.includes(item.productId)) {
        throw new CatalogError('INVALID_INPUT', 'Opening stock must refer to one selected product exactly once.');
      }
      openingStock.set(item.productId, item.quantityPieces);
    }

    const locationId = randomUUID();
    try {
      this.db.transaction(() => {
        if (this.isSetupComplete()) throw new CatalogError('SETUP_ALREADY_COMPLETE', 'Setup has already been completed.');
        this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('business_name', data.businessName);
        this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('setup_complete', 'true');
        this.db.prepare('INSERT INTO locations (id, name) VALUES (?, ?)').run(locationId, data.locationName);
        const insertProduct = this.db.prepare(`
          INSERT INTO products (
            id, sku, name, pieces_per_pack, purchase_cost_per_pack_centavos,
            selling_price_per_piece_centavos, selling_price_per_pack_centavos,
            low_stock_threshold_pieces
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        `);
        const insertBalance = this.db.prepare('INSERT INTO inventory_balances (location_id, product_id, quantity_pieces) VALUES (?, ?, ?)');
        const insertOpeningRecord = this.db.prepare('INSERT INTO opening_stock_records (location_id, product_id, quantity_pieces) VALUES (?, ?, ?)');
        const insertMovement = this.db.prepare(`
          INSERT INTO stock_movements (id, location_id, product_id, quantity_pieces, movement_type, note)
          VALUES (?, ?, ?, ?, 'opening_balance', 'First-run opening stock')
        `);
        for (const productId of data.sampleProductIds) {
          const product = samplesById.get(productId)!;
          insertProduct.run(
            product.id, product.sku, product.name, product.piecesPerPack,
            product.purchaseCostPerPackCentavos, product.sellingPricePerPieceCentavos,
            product.sellingPricePerPackCentavos,
          );
          const quantity = openingStock.get(productId) ?? 0;
          insertBalance.run(locationId, productId, quantity);
          insertOpeningRecord.run(locationId, productId, quantity);
          if (quantity > 0) insertMovement.run(randomUUID(), locationId, productId, quantity);
        }
      }).immediate();
    } catch (error) {
      if (error instanceof CatalogError) throw error;
      translateDatabaseError(error);
    }
    return { complete: true, businessName: data.businessName, locationId };
  }

  listProducts(options: { includeArchived?: boolean } = {}): CatalogProduct[] {
    const sql = options.includeArchived
      ? 'SELECT * FROM products ORDER BY name COLLATE NOCASE, id'
      : 'SELECT * FROM products WHERE is_active = 1 ORDER BY name COLLATE NOCASE, id';
    return (this.db.prepare(sql).all() as ProductRow[]).map(mapProduct);
  }

  saveProduct(input: SaveProductInput): CatalogProduct {
    let data: SaveProductInput;
    try { data = saveProductSchema.parse(input); } catch (error) { invalidInput(error); }
    const id = data.id ?? randomUUID();
    try {
      if (data.id) {
        const result = this.db.prepare(`
          UPDATE products SET sku = ?, name = ?, pieces_per_pack = ?,
            purchase_cost_per_pack_centavos = ?, selling_price_per_piece_centavos = ?,
            selling_price_per_pack_centavos = ?, low_stock_threshold_pieces = ?,
            updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_active = 1
        `).run(data.sku, data.name, data.piecesPerPack, data.purchaseCostPerPackCentavos,
          data.sellingPricePerPieceCentavos, data.sellingPricePerPackCentavos,
          data.lowStockThresholdPieces, id);
        if (result.changes === 0) throw new CatalogError('NOT_FOUND', 'The product is no longer active.');
      } else {
        this.db.prepare(`
          INSERT INTO products (
            id, sku, name, pieces_per_pack, purchase_cost_per_pack_centavos,
            selling_price_per_piece_centavos, selling_price_per_pack_centavos,
            low_stock_threshold_pieces
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, data.sku, data.name, data.piecesPerPack, data.purchaseCostPerPackCentavos,
          data.sellingPricePerPieceCentavos, data.sellingPricePerPackCentavos, data.lowStockThresholdPieces);
      }
    } catch (error) {
      if (error instanceof CatalogError) throw error;
      translateDatabaseError(error);
    }
    return this.listProducts({ includeArchived: true }).find((product) => product.id === id)!;
  }

  archiveProduct(id: string): void {
    try {
      const result = this.db.prepare('UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_active = 1').run(id);
      if (result.changes === 0) throw new CatalogError('NOT_FOUND', 'The product is no longer active.');
    } catch (error) {
      if (error instanceof CatalogError) throw error;
      translateDatabaseError(error);
    }
  }

  listLocations(options: { includeArchived?: boolean } = {}): CatalogLocation[] {
    const sql = options.includeArchived
      ? 'SELECT * FROM locations ORDER BY name COLLATE NOCASE, id'
      : 'SELECT * FROM locations WHERE is_active = 1 ORDER BY name COLLATE NOCASE, id';
    return (this.db.prepare(sql).all() as LocationRow[]).map(mapLocation);
  }

  saveLocation(input: SaveLocationInput): CatalogLocation {
    let data: SaveLocationInput;
    try { data = saveLocationSchema.parse(input); } catch (error) { invalidInput(error); }
    const id = data.id ?? randomUUID();
    try {
      if (data.id) {
        const result = this.db.prepare('UPDATE locations SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_active = 1').run(data.name, id);
        if (result.changes === 0) throw new CatalogError('NOT_FOUND', 'The location is no longer active.');
      } else {
        this.db.prepare('INSERT INTO locations (id, name) VALUES (?, ?)').run(id, data.name);
      }
    } catch (error) {
      if (error instanceof CatalogError) throw error;
      translateDatabaseError(error);
    }
    return this.listLocations({ includeArchived: true }).find((location) => location.id === id)!;
  }

  archiveLocation(id: string): void {
    try {
      this.db.transaction(() => {
        const location = this.db.prepare('SELECT id FROM locations WHERE id = ? AND is_active = 1').get(id);
        if (!location) throw new CatalogError('NOT_FOUND', 'The location is no longer active.');
        const activeCount = this.db.prepare('SELECT COUNT(*) AS count FROM locations WHERE is_active = 1').get() as { count: bigint | number };
        if (Number(activeCount.count) <= 1) {
          throw new CatalogError('LAST_ACTIVE_LOCATION', 'At least one active location must remain.');
        }
        this.db.prepare('UPDATE locations SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
      }).immediate();
    } catch (error) {
      if (error instanceof CatalogError) throw error;
      translateDatabaseError(error);
    }
  }

  private isSetupComplete(): boolean {
    return this.db.prepare("SELECT value FROM settings WHERE key = 'setup_complete'").pluck().get() === 'true';
  }
}
