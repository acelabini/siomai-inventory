import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserCatalogService } from '../../src/browser/catalog-service';
import { BrowserInventoryService } from '../../src/browser/inventory-service';
import { BrowserSalesService } from '../../src/browser/sales-service';
import { BrowserReportService } from '../../src/browser/report-service';
import { manilaBusinessDate, manilaDayRange } from '../../src/browser/time';
import type { CatalogLocation, CatalogProduct } from '../../src/shared/schemas';
import { createTestDatabase } from './test-database';

describe('Manila dates', () => {
  it('uses Manila midnight with inclusive start and exclusive next-day boundaries', () => {
    expect(manilaBusinessDate(new Date('2026-10-14T15:59:59.999Z'))).toBe('2026-10-14');
    expect(manilaBusinessDate(new Date('2026-10-14T16:00:00.000Z'))).toBe('2026-10-15');
    expect(manilaDayRange('2026-10-15')).toEqual({ start: '2026-10-14T16:00:00.000Z', end: '2026-10-15T16:00:00.000Z' });
    expect(manilaDayRange('2028-02-29')).toEqual({ start: '2028-02-28T16:00:00.000Z', end: '2028-02-29T16:00:00.000Z' });
    expect(() => manilaDayRange('2026-02-30')).toThrow();
  });
});

describe('BrowserReportService', () => {
  let fixture: ReturnType<typeof createTestDatabase>;
  let catalog: BrowserCatalogService;
  let inventory: BrowserInventoryService;
  let sales: BrowserSalesService;
  let reports: BrowserReportService;
  let main: CatalogLocation;
  let branch: CatalogLocation;
  let product: CatalogProduct;
  const date = '2026-10-15';
  beforeEach(async () => {
    fixture = createTestDatabase();
    catalog = new BrowserCatalogService(fixture.db);
    inventory = new BrowserInventoryService(fixture.db);
    sales = new BrowserSalesService(fixture.db);
    reports = new BrowserReportService(fixture.db);
    main = await catalog.saveLocation({ name: 'Main' });
    branch = await catalog.saveLocation({ name: 'Branch' });
    product = await catalog.saveProduct({ sku: 'PORK', name: 'Pork', piecesPerPack: 10, purchaseCostPerPackCentavos: 1000, sellingPricePerPieceCentavos: 300, sellingPricePerPackCentavos: 2500, lowStockThresholdPieces: 5 });
  });
  afterEach(async () => { await fixture.cleanup(); });
  async function timestampMovements(relatedEntityId: string, occurredAt: string) {
    await fixture.db.stockMovements.where('relatedEntityId').equals(relatedEntityId).modify({ occurredAt });
  }
  async function sell(locationId: string, quantity: number, businessAt: string) {
    const sale = await sales.completeSale({ locationId, paymentCentavos: quantity * 300, lines: [{ productId: product.id, quantity, unit: 'piece' }] });
    await fixture.db.sales.update(sale.id, { businessAt });
    await timestampMovements(sale.id, businessAt);
    return sale;
  }

  it('aggregates dashboard, snapshots, historical current-cost valuation, counts and location filters', async () => {
    const opening = await inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: product.id, quantity: 10, unit: 'piece' }] });
    await timestampMovements(opening.id, '2026-10-14T15:59:59.999Z');
    const replenished = await inventory.recordReplenishment({ locationId: main.id, lines: [{ productId: product.id, quantity: 1, unit: 'pack' }] });
    await timestampMovements(replenished.id, '2026-10-14T16:00:00.000Z');
    const branchOpening = await inventory.setOpeningStock({ locationId: branch.id, lines: [{ productId: product.id, quantity: 20, unit: 'piece' }] });
    await timestampMovements(branchOpening.id, '2026-10-14T16:00:00.000Z');
    const sale = await sell(main.id, 3, '2026-10-15T01:00:00.000Z');
    const voided = await sell(main.id, 1, '2026-10-15T02:00:00.000Z');
    await sales.voidSale(voided.id, 'Duplicate');
    await fixture.db.stockMovements.where('movementType').equals('sale_void').modify({ occurredAt: '2026-10-15T03:00:00.000Z' });
    const count = await inventory.submitStockCount({ locationId: main.id, lines: [{ productId: product.id, countedQuantity: 15, unit: 'piece', reason: 'Damaged' }] });
    await fixture.db.stockCounts.update(count.id, { countedAt: '2026-10-15T04:00:00.000Z' });
    await timestampMovements(count.id, '2026-10-15T04:00:00.000Z');
    const future = await inventory.recordReplenishment({ locationId: main.id, lines: [{ productId: product.id, quantity: 10, unit: 'piece' }] });
    await timestampMovements(future.id, '2026-10-15T16:00:00.000Z');
    await catalog.saveProduct({ ...product, purchaseCostPerPackCentavos: 2000, lowStockThresholdPieces: 15 });
    const filter = { date, locationId: main.id };
    expect(await reports.getProfitReport(filter)).toEqual({ date, revenueCentavos: 900, costCentavos: 300, grossProfitCentavos: 600 });
    expect(await reports.getSalesReport(filter)).toEqual({ date, sales: [{ id: sale.id, locationId: main.id, businessAt: '2026-10-15T01:00:00.000Z', totalCentavos: 900, costCentavos: 300, grossProfitCentavos: 600, status: 'completed' }] });
    expect(await reports.getDashboard(filter)).toEqual({ locationId: main.id, date, metrics: { revenueCentavos: 900, costCentavos: 300, grossProfitCentavos: 600, stockValueCentavos: 3000, discrepancyCount: 1, lowStockCount: 1 }, products: [{ productId: product.id, sku: 'PORK', productName: 'Pork', piecesPerPack: 10, openingPieces: 10, replenishedPieces: 10, soldPieces: 3, remainingPieces: 15, stockValueCentavos: 3000, lowStockThresholdPieces: 15, isLowStock: true }] });
    expect(await reports.getValuationReport(filter)).toEqual({ date, totalValueCentavos: 3000, items: [{ locationId: main.id, productId: product.id, productName: 'Pork', quantityPieces: 15, valueCentavos: 3000 }] });
    expect((await reports.getValuationReport({ date })).totalValueCentavos).toBe(7000);
    expect(await reports.getDiscrepancyReport(filter)).toEqual({ date, count: 1, items: [{ locationId: main.id, productId: product.id, productName: 'Pork', expectedPieces: 17, countedPieces: 15, differencePieces: -2, countedAt: '2026-10-15T04:00:00.000Z' }] });
    expect(await reports.getLowStockReport(filter)).toEqual({ date, count: 1, items: [{ locationId: main.id, productId: product.id, productName: 'Pork', quantityPieces: 15, lowStockThresholdPieces: 15 }] });
    expect((await reports.getMovementReport(filter)).movements.map((movement) => movement.movementType)).toEqual(['count_adjustment', 'sale_void', 'sale', 'sale', 'replenishment']);
    expect((await reports.getDashboard({ date, locationId: branch.id })).metrics).toMatchObject({ revenueCentavos: 0, stockValueCentavos: 4000, discrepancyCount: 0 });
    expect((await reports.getDashboard({ date: '2026-10-14', locationId: main.id })).products[0]).toMatchObject({ openingPieces: 0, remainingPieces: 10, stockValueCentavos: 2000 });
  });

  it('includes sales exactly at Manila start and excludes those at the next midnight', async () => {
    const opening = await inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: product.id, quantity: 10, unit: 'piece' }] });
    await timestampMovements(opening.id, '2026-10-13T01:00:00.000Z');
    await sell(main.id, 1, '2026-10-14T15:59:59.999Z');
    const start = await sell(main.id, 2, '2026-10-14T16:00:00.000Z');
    await sell(main.id, 3, '2026-10-15T16:00:00.000Z');
    expect((await reports.getSalesReport({ date })).sales.map((sale) => sale.id)).toEqual([start.id]);
    expect((await reports.getProfitReport({ date })).revenueCentavos).toBe(600);
  });

  it('includes zero-stock active pairs, excludes archived pairs from low stock, and retains historical reports', async () => {
    expect((await reports.getLowStockReport({ date })).count).toBe(2);
    await catalog.archiveLocation(branch.id);
    expect((await reports.getLowStockReport({ date })).items.map((item) => item.locationId)).toEqual([main.id]);
    await catalog.archiveProduct(product.id);
    expect((await reports.getLowStockReport({ date })).count).toBe(0);
    expect((await reports.getDashboard({ date })).products).toHaveLength(1);
  });

  it('orders tied movements by descending id and keeps report reads side-effect free', async () => {
    const row = { locationId: main.id, productId: product.id, quantityPieces: 1, movementType: 'replenishment' as const, occurredAt: '2026-10-15T01:00:00.000Z', createdAt: '2026-10-15T01:00:00.000Z', relatedEntityType: null, relatedEntityId: null, note: null, unitCostCentavos: null, lineCostCentavos: null };
    await fixture.db.stockMovements.bulkAdd([{ ...row, id: 'a' }, { ...row, id: 'b' }]);
    const before = await Promise.all(fixture.db.tables.map(async (table) => [table.name, await table.toArray()]));
    expect((await reports.getMovementReport({ date })).movements.map((movement) => movement.id)).toEqual(['b', 'a']);
    await reports.getDashboard({ date });
    expect(await Promise.all(fixture.db.tables.map(async (table) => [table.name, await table.toArray()]))).toEqual(before);
    await expect(reports.getDashboard({ date: '2026-02-30' })).rejects.toThrow();
  });

  it('counts transfer arrivals as replenishment while retaining archived historical stock', async () => {
    const opening = await inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: product.id, quantity: 10, unit: 'piece' }] });
    await timestampMovements(opening.id, '2026-10-14T15:59:59.999Z');
    const transfer = await inventory.transferStock({ fromLocationId: main.id, toLocationId: branch.id, lines: [{ productId: product.id, quantity: 4, unit: 'piece' }] });
    await timestampMovements(transfer.id, '2026-10-15T01:00:00.000Z');
    const count = await inventory.submitStockCount({ locationId: branch.id, lines: [{ productId: product.id, countedQuantity: 4, unit: 'piece' }] });
    await fixture.db.stockCounts.update(count.id, { countedAt: '2026-10-15T02:00:00.000Z' });
    await catalog.archiveProduct(product.id);
    await catalog.archiveLocation(branch.id);
    expect((await reports.getDashboard({ date, locationId: branch.id })).products[0]).toMatchObject({ openingPieces: 0, replenishedPieces: 4, remainingPieces: 4, stockValueCentavos: 400 });
    expect((await reports.getValuationReport({ date, locationId: branch.id })).items).toEqual([expect.objectContaining({ productName: 'Pork', quantityPieces: 4, valueCentavos: 400 })]);
    expect((await reports.getDiscrepancyReport({ date })).count).toBe(0);
    expect((await reports.getLowStockReport({ date })).count).toBe(0);
  });

  it('rejects aggregate valuation amounts outside the safe integer range', async () => {
    const row = { productId: product.id, quantityPieces: 10, movementType: 'opening_balance' as const, occurredAt: '2026-10-14T01:00:00.000Z', createdAt: '2026-10-14T01:00:00.000Z', relatedEntityType: null, relatedEntityId: null, note: null, unitCostCentavos: null, lineCostCentavos: null };
    await fixture.db.stockMovements.bulkAdd([{ ...row, id: 'a', locationId: main.id }, { ...row, id: 'b', locationId: branch.id }]);
    await catalog.saveProduct({ ...product, purchaseCostPerPackCentavos: Number.MAX_SAFE_INTEGER });
    await expect(reports.getValuationReport({ date })).rejects.toThrow('safe integer range');
  });
});
