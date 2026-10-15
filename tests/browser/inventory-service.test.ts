import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserCatalogService } from '../../src/browser/catalog-service';
import { BrowserInventoryService } from '../../src/browser/inventory-service';
import type { CatalogLocation, CatalogProduct, StockMovement } from '../../src/shared/schemas';
import { createTestDatabase } from './test-database';

describe('BrowserInventoryService', () => {
  let fixture: ReturnType<typeof createTestDatabase>;
  let catalog: BrowserCatalogService;
  let inventory: BrowserInventoryService;
  let main: CatalogLocation;
  let branch: CatalogLocation;
  let pork: CatalogProduct;
  let beef: CatalogProduct;
  beforeEach(async () => {
    fixture = createTestDatabase();
    catalog = new BrowserCatalogService(fixture.db);
    inventory = new BrowserInventoryService(fixture.db);
    main = await catalog.saveLocation({ name: 'Main Cart' });
    branch = await catalog.saveLocation({ name: 'Market Cart' });
    pork = await catalog.saveProduct({ sku: 'PORK', name: 'Pork Siomai', piecesPerPack: 66, purchaseCostPerPackCentavos: 14600, sellingPricePerPieceCentavos: 300, sellingPricePerPackCentavos: 19000, lowStockThresholdPieces: 10 });
    beef = await catalog.saveProduct({ sku: 'BEEF', name: 'Beef Siomai', piecesPerPack: 60, purchaseCostPerPackCentavos: 14000, sellingPricePerPieceCentavos: 300, sellingPricePerPackCentavos: 17000, lowStockThresholdPieces: 10 });
  });
  afterEach(async () => { await fixture.cleanup(); });

  async function open(quantity = 66) {
    return inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: pork.id, quantity, unit: 'piece' }] });
  }

  async function ledgerSnapshot() {
    return Promise.all(fixture.db.tables.map(async (table) => [table.name, await table.toArray()]));
  }

  it('creates balances and linked audit movements from exact opening pack quantities', async () => {
    const receipt = await inventory.setOpeningStock({ locationId: main.id, lines: [
      { productId: pork.id, quantity: 1.5, unit: 'pack' }, { productId: beef.id, quantity: 12, unit: 'piece' },
    ] });
    expect(receipt.lines).toEqual([
      { productId: pork.id, quantityPieces: 99, balancePieces: 99 },
      { productId: beef.id, quantityPieces: 12, balancePieces: 12 },
    ]);
    expect(await inventory.getBalances(main.id)).toEqual([
      { locationId: main.id, productId: beef.id, quantityPieces: 12 },
      { locationId: main.id, productId: pork.id, quantityPieces: 99 },
    ].sort((a, b) => a.productId < b.productId ? -1 : 1));
    expect(await fixture.db.openingStockRecords.get([main.id, pork.id])).toMatchObject({ quantityPieces: 99 });
    expect(await inventory.getMovementHistory({ productId: pork.id })).toEqual([expect.objectContaining({
      productName: 'Pork Siomai', quantityPieces: 99, movementType: 'opening_balance', relatedEntityType: 'opening_stock', relatedEntityId: receipt.id,
      unitCostCentavos: null, lineCostCentavos: null, occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
    })]);
  });

  it('remembers zero opening stock without emitting a zero movement', async () => {
    await open(0);
    expect(await fixture.db.inventoryBalances.get([main.id, pork.id])).toMatchObject({ quantityPieces: 0 });
    expect(await inventory.getBalances(main.id)).toEqual([]);
    expect(await inventory.getMovementHistory()).toEqual([]);
    await expect(open(1)).rejects.toMatchObject({ code: 'OPENING_STOCK_ALREADY_SET' });
  });

  it('respects zero opening stock already recorded by setup', async () => {
    const setup = await catalog.completeSetup({ businessName: 'Cart', locationName: 'Setup Cart', sampleProductIds: ['siomai-pork'], openingStock: [] });
    await expect(inventory.setOpeningStock({ locationId: setup.locationId, lines: [{ productId: 'siomai-pork', quantity: 1, unit: 'piece' }] })).rejects.toMatchObject({ code: 'OPENING_STOCK_ALREADY_SET' });
  });

  it('forbids opening stock after activity even when stock returns to zero', async () => {
    await inventory.recordReplenishment({ locationId: main.id, lines: [{ productId: pork.id, quantity: 2, unit: 'piece' }] });
    await inventory.transferStock({ fromLocationId: main.id, toLocationId: branch.id, lines: [{ productId: pork.id, quantity: 2, unit: 'piece' }] });
    await expect(open(1)).rejects.toMatchObject({ code: 'OPENING_STOCK_ALREADY_SET' });
  });

  it('snapshots replenishment entered quantities and exact rounded purchase costs', async () => {
    const receipt = await inventory.recordReplenishment({ locationId: main.id, note: '  Delivery  ', lines: [
      { productId: pork.id, quantity: 1.5, unit: 'pack' }, { productId: beef.id, quantity: 1, unit: 'piece' },
    ] });
    expect(receipt.lines).toEqual([
      { productId: pork.id, quantityPieces: 99, balancePieces: 99, unitCostCentavos: 14600, lineCostCentavos: 21900 },
      { productId: beef.id, quantityPieces: 1, balancePieces: 1, unitCostCentavos: 14000, lineCostCentavos: 233 },
    ]);
    expect(await fixture.db.replenishments.get(receipt.id)).toMatchObject({ locationId: main.id, note: 'Delivery' });
    expect(await fixture.db.replenishmentLines.where('replenishmentId').equals(receipt.id).toArray()).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: pork.id, enteredUnit: 'pack', enteredQuantity: '1.5', unitCostCentavos: 14600, lineCostCentavos: 21900 }),
      expect.objectContaining({ productId: beef.id, lineCostCentavos: 233 }),
    ]));
    await catalog.saveProduct({ ...pork, purchaseCostPerPackCentavos: 99999 });
    expect(await inventory.getMovementHistory({ productId: pork.id })).toEqual([expect.objectContaining({ unitCostCentavos: 14600, lineCostCentavos: 21900, relatedEntityId: receipt.id })]);
    const next = await inventory.recordReplenishment({ locationId: main.id, lines: [{ productId: beef.id, quantity: 2, unit: 'piece' }] });
    expect(next.lines[0]).toMatchObject({ quantityPieces: 2, balancePieces: 3, lineCostCentavos: 467 });
  });

  it('transfers exact packs with a batch, line, paired movements and both balances', async () => {
    await open(132);
    const receipt = await inventory.transferStock({ fromLocationId: main.id, toLocationId: branch.id, note: ' Cart delivery ', lines: [{ productId: pork.id, quantity: 0.5, unit: 'pack' }] });
    expect(receipt.lines).toEqual([{ productId: pork.id, quantityPieces: 33, fromBalancePieces: 99, toBalancePieces: 33 }]);
    expect(await fixture.db.transferBatches.get(receipt.id)).toMatchObject({ fromLocationId: main.id, toLocationId: branch.id, note: 'Cart delivery' });
    expect(await fixture.db.transfers.where('transferBatchId').equals(receipt.id).toArray()).toEqual([expect.objectContaining({ productId: pork.id, quantityPieces: 33, note: 'Cart delivery' })]);
    const movements = (await inventory.getMovementHistory()).filter((movement) => movement.relatedEntityId === receipt.id);
    expect(movements).toHaveLength(2);
    expect(movements).toEqual(expect.arrayContaining([
      expect.objectContaining({ locationId: main.id, movementType: 'transfer_out', quantityPieces: -33, relatedEntityType: 'transfer' }),
      expect.objectContaining({ locationId: branch.id, movementType: 'transfer_in', quantityPieces: 33, relatedEntityType: 'transfer' }),
    ]));
    expect(await inventory.getBalances(branch.id)).toEqual([{ locationId: branch.id, productId: pork.id, quantityPieces: 33 }]);
  });

  it('rejects same-location transfers without any writes', async () => {
    await open();
    const before = await ledgerSnapshot();
    await expect(inventory.transferStock({ fromLocationId: main.id, toLocationId: main.id, lines: [{ productId: pork.id, quantity: 1, unit: 'piece' }] })).rejects.toMatchObject({ code: 'SAME_LOCATION' });
    expect(await ledgerSnapshot()).toEqual(before);
  });

  it('rolls back earlier transfer lines if a later product has insufficient stock', async () => {
    await open(5);
    const before = await ledgerSnapshot();
    await expect(inventory.transferStock({ fromLocationId: main.id, toLocationId: branch.id, lines: [
      { productId: pork.id, quantity: 3, unit: 'piece' }, { productId: beef.id, quantity: 1, unit: 'piece' },
    ] })).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(await ledgerSnapshot()).toEqual(before);
  });

  it('serializes concurrent transfers so stock cannot be overspent', async () => {
    await open(5);
    const input = { fromLocationId: main.id, toLocationId: branch.id, lines: [{ productId: pork.id, quantity: 4, unit: 'piece' as const }] };
    const results = await Promise.allSettled([inventory.transferStock(input), inventory.transferStock(input)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await inventory.getBalances(main.id)).toEqual([{ locationId: main.id, productId: pork.id, quantityPieces: 1 }]);
    expect(await inventory.getBalances(branch.id)).toEqual([{ locationId: branch.id, productId: pork.id, quantityPieces: 4 }]);
    expect(await fixture.db.transferBatches.count()).toBe(1);
  });

  it('requires a discrepancy reason and rolls back the count', async () => {
    await open();
    const before = await ledgerSnapshot();
    await expect(inventory.submitStockCount({ locationId: main.id, lines: [{ productId: pork.id, countedQuantity: 60, unit: 'piece', reason: '  ' }] })).rejects.toMatchObject({ code: 'DISCREPANCY_REASON_REQUIRED' });
    expect(await ledgerSnapshot()).toEqual(before);
  });

  it('records expected and counted pieces with signed adjustments down to zero and up', async () => {
    await open();
    const receipt = await inventory.submitStockCount({ locationId: main.id, note: ' End shift ', lines: [
      { productId: pork.id, countedQuantity: 0, unit: 'piece', reason: ' Damaged ' },
      { productId: beef.id, countedQuantity: 0.5, unit: 'pack', reason: 'Found stock' },
    ] });
    expect(receipt.lines).toEqual([
      { productId: pork.id, expectedPieces: 66, countedPieces: 0, differencePieces: -66, balancePieces: 0 },
      { productId: beef.id, expectedPieces: 0, countedPieces: 30, differencePieces: 30, balancePieces: 30 },
    ]);
    expect(await fixture.db.stockCounts.get(receipt.id)).toMatchObject({ locationId: main.id, note: 'End shift' });
    expect(await fixture.db.stockCountLines.where('stockCountId').equals(receipt.id).toArray()).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: pork.id, expectedPieces: 66, countedPieces: 0, note: 'Damaged' }),
      expect.objectContaining({ productId: beef.id, expectedPieces: 0, countedPieces: 30, note: 'Found stock' }),
    ]));
    expect(await inventory.getMovementHistory({ movementType: 'count_adjustment' })).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: pork.id, quantityPieces: -66, note: 'Damaged', relatedEntityId: receipt.id }),
      expect.objectContaining({ productId: beef.id, quantityPieces: 30, note: 'Found stock', relatedEntityId: receipt.id }),
    ]));
    expect(await inventory.getBalances(main.id)).toEqual([{ locationId: main.id, productId: beef.id, quantityPieces: 30 }]);
  });

  it('records matching stock counts without a reason or extra movement', async () => {
    await open();
    const receipt = await inventory.submitStockCount({ locationId: main.id, lines: [{ productId: pork.id, countedQuantity: 1, unit: 'pack' }] });
    expect(receipt.lines[0]).toMatchObject({ expectedPieces: 66, countedPieces: 66, differencePieces: 0 });
    expect(await fixture.db.stockCountLines.count()).toBe(1);
    expect(await fixture.db.stockMovements.count()).toBe(1);
  });

  it('filters movement history before applying newest-first ordering and the limit', async () => {
    const row = (id: string, locationId: string, productId: string, movementType: StockMovement['movementType'], occurredAt: string) => ({ id, locationId, productId, movementType, occurredAt, createdAt: occurredAt, quantityPieces: 1, relatedEntityType: null, relatedEntityId: null, note: null, unitCostCentavos: null, lineCostCentavos: null });
    await fixture.db.stockMovements.bulkAdd([
      row('a', main.id, pork.id, 'replenishment', '2026-10-12T01:00:00.000Z'),
      row('b', main.id, pork.id, 'replenishment', '2026-10-13T01:00:00.000Z'),
      row('c', main.id, pork.id, 'replenishment', '2026-10-13T01:00:00.000Z'),
      row('d', branch.id, pork.id, 'replenishment', '2026-10-14T01:00:00.000Z'),
      row('e', main.id, beef.id, 'replenishment', '2026-10-14T01:00:00.000Z'),
      row('f', main.id, pork.id, 'opening_balance', '2026-10-14T01:00:00.000Z'),
    ]);
    expect((await inventory.getMovementHistory({ locationId: main.id, productId: pork.id, movementType: 'replenishment', limit: 2 })).map((movement) => movement.id)).toEqual(['c', 'b']);
    expect((await inventory.getMovementHistory())[0]).not.toHaveProperty('createdAt');
    await fixture.db.stockMovements.bulkAdd(Array.from({ length: 210 }, (_, index) => row(`extra-${index}`, main.id, pork.id, 'replenishment', '2026-10-15T01:00:00.000Z')));
    expect(await inventory.getMovementHistory()).toHaveLength(200);
  });

  it('keeps archived balances and history readable but forbids new references', async () => {
    await open();
    await catalog.archiveProduct(pork.id);
    await catalog.archiveLocation(main.id);
    expect(await inventory.getBalances(main.id)).toEqual([{ locationId: main.id, productId: pork.id, quantityPieces: 66 }]);
    expect(await inventory.getMovementHistory({ locationId: main.id })).toEqual([expect.objectContaining({ productName: 'Pork Siomai' })]);
    const before = await ledgerSnapshot();
    for (const operation of [
      () => inventory.setOpeningStock({ locationId: branch.id, lines: [{ productId: pork.id, quantity: 1, unit: 'piece' }] }),
      () => inventory.recordReplenishment({ locationId: branch.id, lines: [{ productId: pork.id, quantity: 1, unit: 'piece' }] }),
      () => inventory.recordReplenishment({ locationId: main.id, lines: [{ productId: beef.id, quantity: 1, unit: 'piece' }] }),
      () => inventory.transferStock({ fromLocationId: branch.id, toLocationId: main.id, lines: [{ productId: beef.id, quantity: 1, unit: 'piece' }] }),
      () => inventory.submitStockCount({ locationId: branch.id, lines: [{ productId: pork.id, countedQuantity: 1, unit: 'piece', reason: 'Count' }] }),
    ]) await expect(operation()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await ledgerSnapshot()).toEqual(before);
  });

  it('rejects invalid quantities, duplicate products, unknown records and query limits without writes', async () => {
    const before = await ledgerSnapshot();
    for (const quantity of [-1, 0, 0.1, Infinity, Number.MAX_SAFE_INTEGER]) {
      await expect(inventory.recordReplenishment({ locationId: main.id, lines: [{ productId: pork.id, quantity, unit: 'pack' }] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    }
    const line = { productId: pork.id, quantity: 1, unit: 'piece' as const };
    await expect(inventory.setOpeningStock({ locationId: main.id, lines: [line, line] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(inventory.recordReplenishment({ locationId: main.id, lines: [line, line] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(inventory.transferStock({ fromLocationId: main.id, toLocationId: branch.id, lines: [line, line] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const count = { productId: pork.id, countedQuantity: 0, unit: 'piece' as const };
    await expect(inventory.submitStockCount({ locationId: main.id, lines: [count, count] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(inventory.recordReplenishment({ locationId: 'missing', lines: [line] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(inventory.recordReplenishment({ locationId: main.id, lines: [{ ...line, productId: 'missing' }] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(inventory.getBalances('')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(inventory.getMovementHistory({ limit: 501 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await ledgerSnapshot()).toEqual(before);
  });

  it('rejects balance overflow and purchase cost overflow atomically', async () => {
    await fixture.db.inventoryBalances.add({ locationId: main.id, productId: pork.id, quantityPieces: Number.MAX_SAFE_INTEGER, updatedAt: new Date().toISOString() });
    const before = await ledgerSnapshot();
    await expect(inventory.recordReplenishment({ locationId: main.id, lines: [{ productId: pork.id, quantity: 1, unit: 'piece' }] })).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(await ledgerSnapshot()).toEqual(before);
    await catalog.saveProduct({ ...beef, purchaseCostPerPackCentavos: Number.MAX_SAFE_INTEGER });
    const expensive = await ledgerSnapshot();
    await expect(inventory.recordReplenishment({ locationId: main.id, lines: [{ productId: beef.id, quantity: 2, unit: 'pack' }] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await ledgerSnapshot()).toEqual(expensive);
  });

  it.each(['opening', 'replenishment', 'transfer', 'count'] as const)('rolls back all %s records after an injected mid-transaction balance failure', async (operation) => {
    if (operation === 'transfer' || operation === 'count') await open();
    const before = await ledgerSnapshot();
    const fail = () => { throw new Error('Injected balance write failure'); };
    const hook = operation === 'count' || operation === 'transfer' ? 'updating' : 'creating';
    if (hook === 'creating') fixture.db.inventoryBalances.hook('creating', fail);
    else fixture.db.inventoryBalances.hook('updating', fail);
    try {
      const promise = operation === 'opening' ? open()
        : operation === 'replenishment' ? inventory.recordReplenishment({ locationId: main.id, lines: [{ productId: pork.id, quantity: 1, unit: 'pack' }] })
          : operation === 'transfer' ? inventory.transferStock({ fromLocationId: main.id, toLocationId: branch.id, lines: [{ productId: pork.id, quantity: 1, unit: 'piece' }] })
            : inventory.submitStockCount({ locationId: main.id, lines: [{ productId: pork.id, countedQuantity: 1, unit: 'piece', reason: 'Damaged' }] });
      await expect(promise).rejects.toThrow();
    } finally {
      fixture.db.inventoryBalances.hook(hook).unsubscribe(fail);
    }
    expect(await ledgerSnapshot()).toEqual(before);
  });
});
