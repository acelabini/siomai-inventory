import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserCatalogService } from '../../src/browser/catalog-service';
import { createTestDatabase } from './test-database';

const setup = {
  businessName: 'Ate Liza’s Siomai', locationName: 'Main Cart',
  sampleProductIds: ['siomai-pork', 'siomai-beef'],
  openingStock: [{ productId: 'siomai-pork', quantityPieces: 132 }],
};
const customProduct = {
  sku: 'CUSTOM', name: 'Custom Siomai', piecesPerPack: 10,
  purchaseCostPerPackCentavos: 10000, sellingPricePerPieceCentavos: 1500,
  sellingPricePerPackCentavos: 15000, lowStockThresholdPieces: 10,
};

describe('BrowserCatalogService', () => {
  let fixture: ReturnType<typeof createTestDatabase>;
  let catalog: BrowserCatalogService;
  beforeEach(() => { fixture = createTestDatabase(); catalog = new BrowserCatalogService(fixture.db); });
  afterEach(async () => { await fixture.cleanup(); });

  it('offers the five sample products before setup without writing ledger data', async () => {
    const state = await catalog.getSetupState();
    expect(state).toMatchObject({ complete: false, businessName: null, locations: [] });
    expect(state.sampleProducts).toEqual([
      expect.objectContaining({ id: 'siomai-pork', sku: 'SIO-PORK', piecesPerPack: 66, purchaseCostPerPackCentavos: 14600 }),
      expect.objectContaining({ id: 'siomai-beef', sku: 'SIO-BEEF', piecesPerPack: 60, purchaseCostPerPackCentavos: 14000 }),
      expect.objectContaining({ id: 'siomai-japanese', sku: 'SIO-JAPANESE', piecesPerPack: 30, purchaseCostPerPackCentavos: 9500 }),
      expect.objectContaining({ id: 'big-siomai-pork', sku: 'BIG-PORK', piecesPerPack: 20, purchaseCostPerPackCentavos: 11000 }),
      expect.objectContaining({ id: 'big-siomai-japanese', sku: 'BIG-JAPANESE', piecesPerPack: 20, purchaseCostPerPackCentavos: 14800 }),
    ]);
    expect(await fixture.db.products.count()).toBe(0);
  });

  it('persists setup, selected products, opening balances and audit records together', async () => {
    const result = await catalog.completeSetup({ ...setup, businessName: '  Ate Liza’s Siomai  ' });
    expect(result).toEqual({ complete: true, businessName: 'Ate Liza’s Siomai', locationId: expect.any(String) });
    expect(await catalog.getSetupState()).toMatchObject({ complete: true, businessName: 'Ate Liza’s Siomai' });
    expect(await catalog.listProducts()).toHaveLength(2);
    expect(await catalog.listLocations()).toEqual([{ id: result.locationId, name: 'Main Cart', isActive: true }]);
    expect(await fixture.db.inventoryBalances.get([result.locationId, 'siomai-pork'])).toMatchObject({ quantityPieces: 132 });
    expect(await fixture.db.inventoryBalances.get([result.locationId, 'siomai-beef'])).toMatchObject({ quantityPieces: 0 });
    expect(await fixture.db.openingStockRecords.count()).toBe(2);
    expect(await fixture.db.stockMovements.toArray()).toEqual([expect.objectContaining({
      productId: 'siomai-pork', locationId: result.locationId, movementType: 'opening_balance', quantityPieces: 132,
      occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
    })]);
    fixture.db.close();
    await fixture.db.open();
    expect((await catalog.getSetupState()).complete).toBe(true);
    await expect(catalog.completeSetup(setup)).rejects.toThrow(/already been completed/);
  });

  it('rolls back every table when a write fails after setup writes have begun', async () => {
    const fail = () => { throw new Error('Forced balance failure'); };
    fixture.db.inventoryBalances.hook('creating', fail);
    await expect(catalog.completeSetup(setup)).rejects.toThrow();
    fixture.db.inventoryBalances.hook('creating').unsubscribe(fail);
    for (const table of fixture.db.tables) expect(await table.count(), table.name).toBe(0);
  });

  it('rejects malformed and inconsistent setup without writing any data', async () => {
    for (const input of [
      { ...setup, locationName: ' ' },
      { ...setup, sampleProductIds: ['unknown'] },
      { ...setup, sampleProductIds: ['siomai-pork', 'siomai-pork'] },
      { ...setup, openingStock: [{ productId: 'unknown', quantityPieces: 1 }] },
      { ...setup, openingStock: [setup.openingStock[0], setup.openingStock[0]] },
    ]) await expect(catalog.completeSetup(input)).rejects.toThrow();
    for (const table of fixture.db.tables) expect(await table.count(), table.name).toBe(0);
  });

  it('rejects duplicate SKUs and location names including concurrent writes', async () => {
    await catalog.saveProduct(customProduct);
    await expect(catalog.saveProduct(customProduct)).rejects.toThrow(/SKU is already in use/);
    const results = await Promise.allSettled([catalog.saveLocation({ name: 'Second Cart' }), catalog.saveLocation({ name: 'Second Cart' })]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await expect(catalog.saveLocation({ name: 'Second Cart' })).rejects.toThrow(/location name is already in use/);
  });

  it('updates catalog fields while preserving IDs and validates public inputs', async () => {
    const product = await catalog.saveProduct(customProduct);
    const location = await catalog.saveLocation({ name: 'Main Cart' });
    expect(await catalog.saveProduct({ ...product, name: 'Updated Siomai', lowStockThresholdPieces: 12 })).toEqual({ ...product, name: 'Updated Siomai', lowStockThresholdPieces: 12 });
    expect(await catalog.saveLocation({ ...location, name: 'New Cart' })).toEqual({ ...location, name: 'New Cart' });
    await expect(catalog.saveProduct({ ...customProduct, piecesPerPack: 0 })).rejects.toThrow();
    await expect(catalog.saveProduct({ ...customProduct, purchaseCostPerPackCentavos: 1.5 })).rejects.toThrow();
    await expect(catalog.saveLocation({ name: ' ' })).rejects.toThrow();
    await expect(catalog.saveProduct({ ...customProduct, id: 'missing' })).rejects.toThrow(/no longer active/);
    await expect(catalog.saveLocation({ id: 'missing', name: 'Missing' })).rejects.toThrow(/no longer active/);
  });

  it('hides archived products and locations while retaining balances and history', async () => {
    const { locationId } = await catalog.completeSetup(setup);
    const other = await catalog.saveLocation({ name: 'Second Cart' });
    await catalog.archiveProduct('siomai-pork');
    await catalog.archiveLocation(locationId);
    expect((await catalog.listProducts()).map((product) => product.id)).toEqual(['siomai-beef']);
    expect(await catalog.listProducts({ includeArchived: true })).toContainEqual(expect.objectContaining({ id: 'siomai-pork', isActive: false }));
    expect(await catalog.listLocations()).toEqual([other]);
    expect(await catalog.listLocations({ includeArchived: true })).toContainEqual({ id: locationId, name: 'Main Cart', isActive: false });
    expect(await fixture.db.inventoryBalances.get([locationId, 'siomai-pork'])).toMatchObject({ quantityPieces: 132 });
    expect(await fixture.db.stockMovements.count()).toBe(1);
    await expect(catalog.saveProduct({ ...customProduct, id: 'siomai-pork' })).rejects.toThrow(/no longer active/);
    await expect(catalog.archiveProduct('siomai-pork')).rejects.toThrow(/no longer active/);
    await expect(catalog.archiveLocation(locationId)).rejects.toThrow(/no longer active/);
    await expect(catalog.archiveLocation(other.id)).rejects.toThrow(/At least one active location/);
    await expect(catalog.archiveProduct('')).rejects.toThrow();
    await expect(catalog.listLocations({ includeArchived: 'yes' } as never)).rejects.toThrow();
  });
});
