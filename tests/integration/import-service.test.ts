import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../src/main/db/test-database';
import { migrateDatabase } from '../../src/main/db/migrations';
import { CatalogService } from '../../src/main/services/catalog-service';
import { InventoryService } from '../../src/main/services/inventory-service';
import { ImportService } from '../../src/main/services/import-service';

function makeService() {
  const { db, cleanup } = createTestDatabase();
  migrateDatabase(db);
  const catalog = new CatalogService(db);
  catalog.completeSetup({ businessName: 'Cart', locationName: 'Main', sampleProductIds: [], openingStock: [] });
  return { db, catalog, inventory: new InventoryService(db), service: new ImportService(db, catalog, new InventoryService(db)), cleanup };
}

describe('ImportService', () => {
  it('previews quoted UTF-8 CSV rows without writes and commits exact piece/pack values', () => {
    const { catalog, inventory, service, cleanup } = makeService();
    try {
      const csv = '\uFEFFSKU,Name,Pieces per pack,Purchase cost (PHP),Piece price (PHP),Pack price (PHP),Opening packs\r\nS-1,"Siomai, Pork",10,12.34,2.50,20.00,2';
      const preview = service.preview({ csv, kind: 'products', locationId: catalog.listLocations()[0]!.id });
      expect(preview.errors).toEqual([]);
      expect(preview.validRows).toBe(1);
      expect(catalog.listProducts()).toHaveLength(0);
      expect(inventory.getBalances(catalog.listLocations()[0]!.id)).toEqual([]);
      const result = service.commit({ csv, kind: 'products', locationId: catalog.listLocations()[0]!.id, token: preview.token, contentHash: preview.contentHash });
      expect(result.importedRows).toBe(1);
      expect(catalog.listProducts()).toEqual([expect.objectContaining({ name: 'Siomai, Pork', piecesPerPack: 10, purchaseCostPerPackCentavos: 1234, sellingPricePerPieceCentavos: 250, sellingPricePerPackCentavos: 2000 })]);
      expect(inventory.getBalances(catalog.listLocations()[0]!.id)).toEqual([expect.objectContaining({ quantityPieces: 20 })]);
    } finally { cleanup(); }
  });

  it('requires an active location when product rows include opening packs', () => {
    const { catalog, service, cleanup } = makeService();
    try {
      const csv = 'SKU,Name,Pieces per pack,Purchase cost (PHP),Piece price (PHP),Pack price (PHP),Opening packs\nA,Product,10,10,1,9,2';
      const preview = service.preview({ csv, kind: 'products' });
      expect(preview.errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 1, message: expect.stringMatching(/location/i) })]));
      expect(() => service.commit({ csv, kind: 'products', token: preview.token, contentHash: preview.contentHash })).toThrow();
      expect(catalog.listProducts()).toHaveLength(0);
    } finally { cleanup(); }
  });

  it('reports missing required columns and row-numbered duplicate SKU errors before writing', () => {
    const { catalog, service, cleanup } = makeService();
    try {
      const missingColumns = service.preview({ csv: 'SKU,Name\nDUP,One', kind: 'products' });
      const duplicates = service.preview({ csv: 'SKU,Name,Pieces per pack,Purchase cost (PHP),Piece price (PHP),Pack price (PHP)\nDUP,One,10,10,1,9\nDUP,Two,10,10,1,9', kind: 'products' });
      expect(missingColumns.errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 1, message: expect.stringMatching(/required column/i) })]));
      expect(duplicates.errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 3, message: expect.stringMatching(/duplicate SKU/i) })]));
      expect(catalog.listProducts()).toHaveLength(0);
    } finally { cleanup(); }
  });

  it('rejects an SKU reserved by an archived product before attempting the write', () => {
    const { catalog, service, cleanup } = makeService();
    try {
      const archived = catalog.saveProduct({ sku: 'RETIRED', name: 'Retired product', piecesPerPack: 10, purchaseCostPerPackCentavos: 1000, sellingPricePerPieceCentavos: 100, sellingPricePerPackCentavos: 900, lowStockThresholdPieces: 0 });
      catalog.archiveProduct(archived.id);
      const csv = 'SKU,Name,Pieces per pack,Purchase cost (PHP),Piece price (PHP),Pack price (PHP)\nRETIRED,New product,10,10,1,9';
      const preview = service.preview({ csv, kind: 'products' });
      expect(preview.errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 2, message: expect.stringMatching(/duplicate SKU/i) })]));
      expect(() => service.commit({ csv, kind: 'products', token: preview.token, contentHash: preview.contentHash })).toThrow();
    } finally { cleanup(); }
  });

  it('requires explicit mapping for ambiguous product names and validates content-bound previews', () => {
    const { catalog, service, cleanup } = makeService();
    try {
      catalog.saveProduct({ sku: 'ONE', name: 'Siomai', piecesPerPack: 10, purchaseCostPerPackCentavos: 1000, sellingPricePerPieceCentavos: 100, sellingPricePerPackCentavos: 900, lowStockThresholdPieces: 0 });
      catalog.saveProduct({ sku: 'TWO', name: 'Siomai', piecesPerPack: 20, purchaseCostPerPackCentavos: 2000, sellingPricePerPieceCentavos: 200, sellingPricePerPackCentavos: 1800, lowStockThresholdPieces: 0 });
      const csv = 'Product,Quantity,Unit\nSiomai,2,pack';
      const preview = service.preview({ csv, kind: 'opening-stock', locationId: catalog.listLocations()[0]!.id, mapping: { sku: 'SKU', name: 'Product', quantity: 'Quantity', unit: 'Unit' } });
      expect(preview.errors[0]).toMatchObject({ row: 2, message: expect.stringMatching(/ambiguous/i) });
      expect(() => service.commit({ csv: `${csv}\n`, kind: 'opening-stock', locationId: catalog.listLocations()[0]!.id, token: preview.token, contentHash: preview.contentHash })).toThrow(/changed/i);
    } finally { cleanup(); }
  });

  it('labels spreadsheet imports as aggregates and never creates sales', () => {
    const { db, catalog, service, cleanup } = makeService();
    try {
      const locationId = catalog.listLocations()[0]!.id;
      const csv = 'Product name,Pieces per pack,Pack quantity,Replenishment quantity,Pieces,Total cost\nSiomai Pork,10,2,1,3,30.00';
      const preview = service.preview({ csv, kind: 'spreadsheet-aggregate', locationId });
      expect(preview.summary).toMatch(/aggregate/i);
      expect(preview.errors).toEqual([]);
      service.commit({ csv, kind: 'spreadsheet-aggregate', locationId, token: preview.token, contentHash: preview.contentHash });
      expect(Number((db.prepare('SELECT COUNT(*) AS count FROM sales').get() as { count: number }).count)).toBe(0);
      expect(db.prepare('SELECT movement_type FROM stock_movements').all()).toEqual(expect.arrayContaining([expect.objectContaining({ movement_type: 'opening_balance' }), expect.objectContaining({ movement_type: 'replenishment' })]));
    } finally { cleanup(); }
  });

  it('rolls back all rows when a later row becomes invalid before commit', () => {
    const { catalog, service, cleanup } = makeService();
    try {
      const csv = 'SKU,Name,Pieces per pack,Purchase cost (PHP),Piece price (PHP),Pack price (PHP)\nA,Valid,10,10,1,9\nB,Invalid,0,10,1,9';
      const preview = service.preview({ csv, kind: 'products' });
      expect(preview.errors[0]?.row).toBe(3);
      expect(() => service.commit({ csv, kind: 'products', token: preview.token, contentHash: preview.contentHash })).toThrow();
      expect(catalog.listProducts()).toHaveLength(0);
    } finally { cleanup(); }
  });
});
