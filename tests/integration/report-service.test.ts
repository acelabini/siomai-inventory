import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../src/main/db/test-database';
import { migrateDatabase } from '../../src/main/db/migrations';
import { CatalogService } from '../../src/main/services/catalog-service';
import { InventoryService } from '../../src/main/services/inventory-service';
import { SalesService } from '../../src/main/services/sales-service';
import { ReportService } from '../../src/main/services/report-service';

describe('ReportService', () => {
  it('projects a Manila business day from immutable ledger and sale snapshots, isolated by date and location', () => {
    const { db, cleanup } = createTestDatabase();
    try {
      migrateDatabase(db);
      const catalog = new CatalogService(db);
      catalog.completeSetup({ businessName: 'Cart ni Ate', locationName: 'Main Cart', sampleProductIds: [], openingStock: [] });
      const [main] = catalog.listLocations();
      const branch = catalog.saveLocation({ name: 'Market Cart' });
      const pork = catalog.saveProduct({ sku: 'SIO-PORK', name: 'Siomai Pork', piecesPerPack: 10, purchaseCostPerPackCentavos: 1000, sellingPricePerPieceCentavos: 300, sellingPricePerPackCentavos: 2500, lowStockThresholdPieces: 5 });
      const inventory = new InventoryService(db);
      const sales = new SalesService(db);
      inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: pork.id, quantity: 0, unit: 'piece' }] });
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const priorDay = new Date(`${date}T00:00:00.000Z`);
      priorDay.setUTCDate(priorDay.getUTCDate() - 1);
      const priorDate = priorDay.toISOString().slice(0, 10);
      db.prepare(`INSERT INTO stock_movements (id, location_id, product_id, quantity_pieces, movement_type, occurred_at)
        VALUES ('prior-opening', ?, ?, 10, 'opening_balance', ?)`)
        .run(main.id, pork.id, `${priorDate} 15:59:59`);
      db.prepare('INSERT INTO inventory_balances (location_id, product_id, quantity_pieces) VALUES (?, ?, 10)').run(main.id, pork.id);
      inventory.recordReplenishment({ locationId: main.id, lines: [{ productId: pork.id, quantity: 1, unit: 'pack' }] });
      inventory.setOpeningStock({ locationId: branch.id, lines: [{ productId: pork.id, quantity: 2, unit: 'pack' }] });
      const sale = sales.completeSale({ locationId: main.id, paymentCentavos: 900, lines: [{ productId: pork.id, quantity: 3, unit: 'piece' }] });
      const voided = sales.completeSale({ locationId: main.id, paymentCentavos: 300, lines: [{ productId: pork.id, quantity: 1, unit: 'piece' }] });
      sales.voidSale(voided.id, 'Entered twice');
      inventory.submitStockCount({ locationId: main.id, lines: [{ productId: pork.id, countedQuantity: 15, unit: 'piece', reason: 'Counted at close' }] });
      db.prepare('UPDATE sales SET business_at = CURRENT_TIMESTAMP WHERE id IN (?, ?)').run(sale.id, voided.id);
      // The inserted prior opening precedes today's 16:00 UTC Manila boundary; service events are today.
      const reports = new ReportService(db);
      const report = reports.getDashboard({ locationId: main.id, date });
      expect(report).toMatchObject({
        locationId: main.id, date,
        metrics: { revenueCentavos: 900, costCentavos: 300, grossProfitCentavos: 600, stockValueCentavos: 1500, discrepancyCount: 1, lowStockCount: 0 },
      });
      expect(report.products).toEqual([expect.objectContaining({
        productId: pork.id, productName: 'Siomai Pork', openingPieces: 10, replenishedPieces: 10,
        soldPieces: 3, remainingPieces: 15, stockValueCentavos: 1500, isLowStock: false,
      })]);
      expect(reports.getDashboard({ locationId: branch.id, date }).metrics.revenueCentavos).toBe(0);
      const previousDate = new Date(`${date}T00:00:00.000Z`);
      previousDate.setUTCDate(previousDate.getUTCDate() - 1);
      expect(reports.getDashboard({ locationId: main.id, date: previousDate.toISOString().slice(0, 10) }).metrics.revenueCentavos).toBe(0);
      expect(reports.getProfitReport({ locationId: main.id, date })).toMatchObject({ revenueCentavos: 900, costCentavos: 300, grossProfitCentavos: 600 });
      expect(reports.getSalesReport({ locationId: main.id, date }).sales).toHaveLength(1);
      expect(reports.getMovementReport({ locationId: main.id, date }).movements).toEqual(expect.arrayContaining([expect.objectContaining({ movementType: 'sale_void', quantityPieces: 1 })]));
      expect(reports.getValuationReport({ locationId: main.id, date })).toMatchObject({ totalValueCentavos: 1500, items: [expect.objectContaining({ quantityPieces: 15, valueCentavos: 1500 })] });
      expect(reports.getDiscrepancyReport({ locationId: main.id, date }).count).toBe(1);
      expect(reports.getLowStockReport({ locationId: main.id, date }).items).toHaveLength(0);
      const updatedProduct = catalog.listProducts()[0]!;
      catalog.saveProduct({ ...updatedProduct, lowStockThresholdPieces: 20 });
      expect(reports.getDashboard({ locationId: main.id, date }).metrics.lowStockCount).toBe(1);
      expect(reports.getLowStockReport({ locationId: main.id, date }).items).toEqual([
        expect.objectContaining({ productId: pork.id, quantityPieces: 15, lowStockThresholdPieces: 20 }),
      ]);
    } finally { cleanup(); }
  });
});
