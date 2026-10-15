import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserCatalogService } from '../../src/browser/catalog-service';
import { BrowserInventoryService } from '../../src/browser/inventory-service';
import { BrowserSalesService } from '../../src/browser/sales-service';
import type { CatalogLocation, CatalogProduct } from '../../src/shared/schemas';
import { createTestDatabase } from './test-database';

describe('BrowserSalesService', () => {
  let fixture: ReturnType<typeof createTestDatabase>;
  let catalog: BrowserCatalogService;
  let inventory: BrowserInventoryService;
  let sales: BrowserSalesService;
  let location: CatalogLocation;
  let product: CatalogProduct;
  beforeEach(async () => {
    fixture = createTestDatabase();
    catalog = new BrowserCatalogService(fixture.db);
    inventory = new BrowserInventoryService(fixture.db);
    sales = new BrowserSalesService(fixture.db);
    location = await catalog.saveLocation({ name: 'Main' });
    product = await catalog.saveProduct({ sku: 'PORK', name: 'Pork', piecesPerPack: 10, purchaseCostPerPackCentavos: 1001, sellingPricePerPieceCentavos: 300, sellingPricePerPackCentavos: 2501, lowStockThresholdPieces: 5 });
    await inventory.setOpeningStock({ locationId: location.id, lines: [{ productId: product.id, quantity: 20, unit: 'piece' }] });
  });
  afterEach(async () => { await fixture.cleanup(); });
  const snapshot = () => Promise.all(fixture.db.tables.map(async (table) => [table.name, await table.toArray()]));
  const sell = (quantity = 3, paymentCentavos = 1000) => sales.completeSale({ locationId: location.id, paymentCentavos, lines: [{ productId: product.id, quantity, unit: 'piece' }] });

  it('snapshots mixed unit prices, exact rounded costs, entry order, payment and grouped stock movements', async () => {
    const receipt = await sales.completeSale({ locationId: location.id, paymentCentavos: 3000, note: ' Cash ', lines: [
      { productId: product.id, quantity: 0.5, unit: 'pack' }, { productId: product.id, quantity: 2, unit: 'piece' },
    ] });
    expect(receipt).toMatchObject({ totalCentavos: 1851, paymentCentavos: 3000, changeCentavos: 1149, status: 'completed', note: 'Cash' });
    expect(receipt.lines).toEqual([
      { productId: product.id, productName: 'Pork', quantityPieces: 5, enteredUnit: 'pack', enteredQuantity: '0.5', unitSellingPriceCentavos: 2501, unitCostCentavos: 1001, lineRevenueCentavos: 1251, lineCostCentavos: 501, balancePieces: 13 },
      { productId: product.id, productName: 'Pork', quantityPieces: 2, enteredUnit: 'piece', enteredQuantity: '2', unitSellingPriceCentavos: 300, unitCostCentavos: 1001, lineRevenueCentavos: 600, lineCostCentavos: 200, balancePieces: 13 },
    ]);
    expect(await inventory.getMovementHistory({ movementType: 'sale' })).toEqual([expect.objectContaining({ quantityPieces: -7, relatedEntityId: receipt.id, unitCostCentavos: 1001, lineCostCentavos: 701 })]);
    await catalog.saveProduct({ ...product, sellingPricePerPieceCentavos: 900, purchaseCostPerPackCentavos: 5000 });
    expect((await sales.listSales())[0].lines[0]).toMatchObject({ unitSellingPriceCentavos: 2501, unitCostCentavos: 1001, lineRevenueCentavos: 1251, lineCostCentavos: 501 });
    expect((await sales.listSales())[0].lines[0]).not.toHaveProperty('balancePieces');
  });

  it('rejects insufficient payment and stock with no partial ledger records', async () => {
    const before = await snapshot();
    await expect(sell(3, 899)).rejects.toMatchObject({ code: 'INSUFFICIENT_PAYMENT' });
    await expect(sell(21, 10000)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    await expect(sales.completeSale({ locationId: location.id, paymentCentavos: 10000, lines: [
      { productId: product.id, quantity: 11, unit: 'piece' }, { productId: product.id, quantity: 10, unit: 'piece' },
    ] })).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(await snapshot()).toEqual(before);
  });

  it('serializes near-simultaneous sales against one balance', async () => {
    const results = await Promise.allSettled([sell(15, 5000), sell(15, 5000)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toEqual([expect.objectContaining({ reason: expect.objectContaining({ code: 'INSUFFICIENT_STOCK' }) })]);
    expect(await inventory.getBalances(location.id)).toEqual([{ locationId: location.id, productId: product.id, quantityPieces: 5 }]);
    expect(await fixture.db.sales.count()).toBe(1);
    expect(await fixture.db.saleLines.count()).toBe(1);
  });

  it('preserves per-entry rounding and restores repeated product lines with one void movement', async () => {
    const sale = await sales.completeSale({ locationId: location.id, paymentCentavos: 3000, lines: [
      { productId: product.id, quantity: 0.5, unit: 'pack' }, { productId: product.id, quantity: 0.5, unit: 'pack' },
    ] });
    expect(sale.totalCentavos).toBe(2502);
    expect(sale.lines.map((line) => line.lineCostCentavos)).toEqual([501, 501]);
    expect(await inventory.getMovementHistory({ movementType: 'sale' })).toEqual([expect.objectContaining({ quantityPieces: -10, lineCostCentavos: 1002 })]);
    const voided = await sales.voidSale(sale.id, 'Duplicate');
    expect(voided.lines.map((line) => line.balancePieces)).toEqual([20, 20]);
    expect(await inventory.getMovementHistory({ movementType: 'sale_void' })).toEqual([expect.objectContaining({ quantityPieces: 10 })]);
  });

  it('rolls back earlier products when a later product runs out of stock', async () => {
    const other = await catalog.saveProduct({ ...product, id: undefined, sku: 'BEEF', name: 'Beef' });
    const before = await snapshot();
    await expect(sales.completeSale({ locationId: location.id, paymentCentavos: 1000, lines: [
      { productId: product.id, quantity: 1, unit: 'piece' }, { productId: other.id, quantity: 1, unit: 'piece' },
    ] })).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(await snapshot()).toEqual(before);
  });

  it('rejects sale arithmetic overflow and rolls back a void that would overflow stock', async () => {
    await catalog.saveProduct({ ...product, sellingPricePerPieceCentavos: Number.MAX_SAFE_INTEGER });
    const before = await snapshot();
    await expect(sell(2, Number.MAX_SAFE_INTEGER)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await snapshot()).toEqual(before);
    await catalog.saveProduct(product);
    const sale = await sell();
    await fixture.db.inventoryBalances.update([location.id, product.id], { quantityPieces: Number.MAX_SAFE_INTEGER });
    const beforeVoid = await snapshot();
    await expect(sales.voidSale(sale.id, 'Duplicate')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await snapshot()).toEqual(beforeVoid);
  });

  it('requires a void reason, restores grouped stock once even after archival, and retains sale snapshots', async () => {
    const sale = await sell();
    const before = await snapshot();
    await expect(sales.voidSale(sale.id, '  ')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await snapshot()).toEqual(before);
    await catalog.archiveProduct(product.id);
    await catalog.saveLocation({ name: 'Other' });
    await catalog.archiveLocation(location.id);
    const results = await Promise.allSettled([sales.voidSale(sale.id, ' Duplicate '), sales.voidSale(sale.id, 'Duplicate')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toEqual([expect.objectContaining({ reason: expect.objectContaining({ code: 'ALREADY_VOIDED' }) })]);
    expect((await sales.listSales())[0]).toMatchObject({ ...sale, status: 'voided', lines: [expect.objectContaining({ lineRevenueCentavos: 900, lineCostCentavos: 300 })] });
    expect(await inventory.getBalances(location.id)).toEqual([{ locationId: location.id, productId: product.id, quantityPieces: 20 }]);
    expect(await inventory.getMovementHistory({ movementType: 'sale_void' })).toEqual([expect.objectContaining({ quantityPieces: 3, note: 'Duplicate', relatedEntityType: 'sale_void', relatedEntityId: sale.id })]);
  });

  it('filters sale history before limiting and orders newest first', async () => {
    const first = await sell();
    await fixture.db.sales.update(first.id, { businessAt: '2026-10-13T01:00:00.000Z' });
    const second = await sell();
    await sales.voidSale(second.id, 'Duplicate');
    const other = await catalog.saveLocation({ name: 'Other' });
    expect((await sales.listSales({ locationId: location.id, status: 'completed', limit: 1 })).map((sale) => sale.id)).toEqual([first.id]);
    expect((await sales.listSales({ status: 'voided' })).map((sale) => sale.id)).toEqual([second.id]);
    expect(await sales.listSales({ locationId: other.id })).toEqual([]);
    await expect(sales.listSales({ limit: 501 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects fractional pieces, invalid inputs, missing prices and inactive references atomically', async () => {
    const before = await snapshot();
    for (const quantity of [0, -1, 0.1, Infinity]) await expect(sell(quantity)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(sales.voidSale('missing', 'Reason')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await snapshot()).toEqual(before);
    await catalog.saveProduct({ ...product, sellingPricePerPieceCentavos: 0 });
    await expect(sell()).rejects.toMatchObject({ code: 'PRICE_NOT_SET' });
    await catalog.archiveProduct(product.id);
    await expect(sell()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it.each(['complete', 'void'] as const)('rolls back %s after a balance storage failure', async (operation) => {
    const sale = operation === 'void' ? await sell() : undefined;
    const before = await snapshot();
    const fail = () => { throw new Error('Injected balance write failure'); };
    fixture.db.inventoryBalances.hook('updating', fail);
    try { await expect(sale ? sales.voidSale(sale.id, 'Duplicate') : sell()).rejects.toThrow(); }
    finally { fixture.db.inventoryBalances.hook('updating').unsubscribe(fail); }
    expect(await snapshot()).toEqual(before);
  });
});
