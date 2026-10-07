import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../src/main/db/test-database';
import { migrateDatabase } from '../../src/main/db/migrations';
import { CatalogService } from '../../src/main/services/catalog-service';

const setup = {
  businessName: 'Ate Liza’s Siomai',
  locationName: 'Main Cart',
  sampleProductIds: ['siomai-pork', 'siomai-beef', 'siomai-japanese', 'big-siomai-pork', 'big-siomai-japanese'],
  openingStock: [],
};

function createCatalog() {
  const { db, cleanup } = createTestDatabase();
  migrateDatabase(db);
  return { catalog: new CatalogService(db), cleanup };
}

describe('CatalogService', () => {
  it('offers stable sample products with exact source costs and pack sizes', () => {
    const { catalog, cleanup } = createCatalog();
    try {
      const samples = catalog.getSetupState().sampleProducts;
      expect(samples).toEqual([
        expect.objectContaining({ id: 'siomai-pork', name: 'Siomai Pork', sku: 'SIO-PORK', piecesPerPack: 66, purchaseCostPerPackCentavos: 14600, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0 }),
        expect.objectContaining({ id: 'siomai-beef', name: 'Siomai Beef', sku: 'SIO-BEEF', piecesPerPack: 60, purchaseCostPerPackCentavos: 14000, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0 }),
        expect.objectContaining({ id: 'siomai-japanese', name: 'Siomai Japanese', sku: 'SIO-JAPANESE', piecesPerPack: 30, purchaseCostPerPackCentavos: 9500, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0 }),
        expect.objectContaining({ id: 'big-siomai-pork', name: 'Big Siomai Pork', sku: 'BIG-PORK', piecesPerPack: 20, purchaseCostPerPackCentavos: 11000, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0 }),
        expect.objectContaining({ id: 'big-siomai-japanese', name: 'Big Siomai Japanese', sku: 'BIG-JAPANESE', piecesPerPack: 20, purchaseCostPerPackCentavos: 14800, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0 }),
      ]);
      expect(new Set(samples.map((product) => product.sku)).size).toBe(5);
    } finally {
      cleanup();
    }
  });

  it('completes setup with selected products and one active location', () => {
    const { catalog, cleanup } = createCatalog();
    try {
      const result = catalog.completeSetup(setup);
      expect(result).toEqual({ complete: true, businessName: 'Ate Liza’s Siomai', locationId: expect.any(String) });
      expect(catalog.listProducts()).toHaveLength(5);
      expect(catalog.listLocations()).toEqual([expect.objectContaining({ name: 'Main Cart', isActive: true })]);
      expect(catalog.getSetupState().complete).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('rejects setup without an active location and rolls back all writes', () => {
    const { catalog, cleanup } = createCatalog();
    try {
      expect(() => catalog.completeSetup({ ...setup, locationName: '   ' })).toThrowError();
      expect(catalog.getSetupState().complete).toBe(false);
      expect(catalog.listProducts()).toHaveLength(0);
      expect(catalog.listLocations()).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it('rejects duplicate SKUs and invalid pieces per pack or centavo values', () => {
    const { catalog, cleanup } = createCatalog();
    try {
      catalog.completeSetup(setup);
      const first = catalog.listProducts()[0];
      expect(() => catalog.saveProduct({ ...first, id: undefined, sku: first.sku })).toThrowError();
      expect(() => catalog.saveProduct({ ...first, piecesPerPack: 0 })).toThrowError();
      expect(() => catalog.saveProduct({ ...first, purchaseCostPerPackCentavos: 1.5 })).toThrowError();
    } finally {
      cleanup();
    }
  });

  it('stores editable nonnegative low-stock thresholds in whole pieces', () => {
    const { catalog, cleanup } = createCatalog();
    try {
      catalog.completeSetup(setup);
      const product = catalog.listProducts()[0]!;
      const updated = catalog.saveProduct({ ...product, lowStockThresholdPieces: 12 });
      expect(updated.lowStockThresholdPieces).toBe(12);
      expect(() => catalog.saveProduct({ ...updated, lowStockThresholdPieces: -1 })).toThrowError();
    } finally { cleanup(); }
  });

  it('archives products without deleting their historical records', () => {
    const { catalog, cleanup } = createCatalog();
    try {
      catalog.completeSetup(setup);
      const product = catalog.listProducts()[0];
      catalog.archiveProduct(product.id);
      expect(catalog.listProducts().some((item) => item.id === product.id)).toBe(false);
      expect(catalog.listProducts({ includeArchived: true }).find((item) => item.id === product.id)?.isActive).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('refuses to archive the last active location', () => {
    const { catalog, cleanup } = createCatalog();
    try {
      catalog.completeSetup(setup);
      const [location] = catalog.listLocations();
      expect(() => catalog.archiveLocation(location.id)).toThrowError();
      expect(catalog.listLocations()).toHaveLength(1);
    } finally {
      cleanup();
    }
  });
});
