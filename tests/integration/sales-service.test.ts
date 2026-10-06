import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../src/main/db/test-database';
import { migrateDatabase } from '../../src/main/db/migrations';
import { CatalogService } from '../../src/main/services/catalog-service';
import { InventoryService } from '../../src/main/services/inventory-service';
import { SalesService } from '../../src/main/services/sales-service';

function createLedger() {
  const { db, cleanup } = createTestDatabase();
  migrateDatabase(db);
  const catalog = new CatalogService(db);
  catalog.completeSetup({ businessName: 'Cart ni Ate', locationName: 'Main Cart', sampleProductIds: [], openingStock: [] });
  const [main] = catalog.listLocations();
  const pork = catalog.saveProduct({ sku: 'SIO-PORK', name: 'Siomai Pork', piecesPerPack: 10, purchaseCostPerPackCentavos: 1001, sellingPricePerPieceCentavos: 300, sellingPricePerPackCentavos: 2500, lowStockThresholdPieces: 2 });
  const beef = catalog.saveProduct({ sku: 'SIO-BEEF', name: 'Siomai Beef', piecesPerPack: 6, purchaseCostPerPackCentavos: 700, sellingPricePerPieceCentavos: 275, sellingPricePerPackCentavos: 1500, lowStockThresholdPieces: 2 });
  const inventory = new InventoryService(db);
  const sales = new SalesService(db);
  return { db, catalog, inventory, sales, main, pork, beef, cleanup };
}

describe('SalesService', () => {
  it('preserves duplicate pack and piece source lines and consolidates stock deductions', () => {
    const { db, catalog, inventory, sales, main, pork, cleanup } = createLedger();
    try {
      inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: pork.id, quantity: 30, unit: 'piece' }] });
      const receipt = sales.completeSale({ locationId: main.id, paymentCentavos: 4000, lines: [
        { productId: pork.id, quantity: 1, unit: 'pack' },
        { productId: pork.id, quantity: 3, unit: 'piece' },
      ] });
      expect(receipt).toMatchObject({ totalCentavos: 3400, paymentCentavos: 4000, changeCentavos: 600 });
      expect(receipt.lines).toHaveLength(2);
      expect(receipt.lines).toEqual([
        expect.objectContaining({ productId: pork.id, quantityPieces: 10, enteredUnit: 'pack', enteredQuantity: '1', unitSellingPriceCentavos: 2500, unitCostCentavos: 1001, lineRevenueCentavos: 2500, lineCostCentavos: 1001 }),
        expect.objectContaining({ productId: pork.id, quantityPieces: 3, enteredUnit: 'piece', enteredQuantity: '3', unitSellingPriceCentavos: 300, unitCostCentavos: 1001, lineRevenueCentavos: 900, lineCostCentavos: 300 }),
      ]);
      expect(receipt.lines.every((line) => line.balancePieces === 17)).toBe(true);
      expect((db.prepare('SELECT COUNT(*) AS count FROM stock_movements WHERE related_entity_id = ? AND movement_type = ?').get(receipt.id, 'sale') as { count: number | bigint }).count).toBe(1n);
      catalog.saveProduct({ id: pork.id, sku: pork.sku, name: pork.name, piecesPerPack: 10, purchaseCostPerPackCentavos: 9999, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0, lowStockThresholdPieces: 2 });
      expect(sales.listSales({ locationId: main.id })).toEqual([expect.objectContaining({ id: receipt.id, totalCentavos: 3400, paymentCentavos: 4000, status: 'completed', lines: [
        expect.objectContaining({ enteredUnit: 'pack', enteredQuantity: '1', unitSellingPriceCentavos: 2500, unitCostCentavos: 1001, lineRevenueCentavos: 2500, quantityPieces: 10 }),
        expect.objectContaining({ enteredUnit: 'piece', enteredQuantity: '3', unitSellingPriceCentavos: 300, unitCostCentavos: 1001, lineRevenueCentavos: 900, quantityPieces: 3 }),
      ] })]);
      expect(inventory.getBalances(main.id)).toEqual([expect.objectContaining({ productId: pork.id, quantityPieces: 17 })]);
      expect(inventory.getMovementHistory({ locationId: main.id, movementType: 'sale' })).toEqual([expect.objectContaining({ quantityPieces: -13, unitCostCentavos: 1001, lineCostCentavos: 1301 })]);
    } finally { cleanup(); }
  });

  it('uses the piece price for piece-only lines and returns change from sufficient payment', () => {
    const { inventory, sales, main, pork, cleanup } = createLedger();
    try {
      inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: pork.id, quantity: 10, unit: 'piece' }] });
      expect(sales.completeSale({ locationId: main.id, paymentCentavos: 1000, lines: [{ productId: pork.id, quantity: 2, unit: 'piece' }] })).toMatchObject({ totalCentavos: 600, changeCentavos: 400 });
    } finally { cleanup(); }
  });

  it('rounds fractional-pack revenue to an exact centavo total', () => {
    const { db, inventory, sales, main, pork, cleanup } = createLedger();
    try {
      inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: pork.id, quantity: 1, unit: 'piece' }] });
      db.prepare('UPDATE products SET selling_price_per_pack_centavos = 2501 WHERE id = ?').run(pork.id);
      const receipt = sales.completeSale({ locationId: main.id, paymentCentavos: 251, lines: [{ productId: pork.id, quantity: 0.1, unit: 'pack' }] });
      expect(receipt).toMatchObject({ totalCentavos: 250, changeCentavos: 1, lines: [expect.objectContaining({ quantityPieces: 1, lineRevenueCentavos: 250 })] });
    } finally { cleanup(); }
  });

  it('rejects insufficient payment, zero selling prices and insufficient inventory', () => {
    const { db, inventory, sales, main, pork, cleanup } = createLedger();
    try {
      inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: pork.id, quantity: 5, unit: 'piece' }] });
      expect(() => sales.completeSale({ locationId: main.id, paymentCentavos: 1, lines: [{ productId: pork.id, quantity: 1, unit: 'piece' }] })).toThrowError(expect.objectContaining({ code: 'INSUFFICIENT_PAYMENT' }));
      expect(() => sales.completeSale({ locationId: main.id, paymentCentavos: 1800, lines: [{ productId: pork.id, quantity: 6, unit: 'piece' }] })).toThrowError(expect.objectContaining({ code: 'INSUFFICIENT_STOCK' }));
      db.prepare('UPDATE products SET selling_price_per_piece_centavos = 0 WHERE id = ?').run(pork.id);
      expect(() => sales.completeSale({ locationId: main.id, paymentCentavos: 0, lines: [{ productId: pork.id, quantity: 1, unit: 'piece' }] })).toThrowError(expect.objectContaining({ code: 'PRICE_NOT_SET' }));
      expect(() => sales.completeSale({ locationId: main.id, paymentCentavos: 1, lines: [{ productId: 'free', quantity: 1, unit: 'piece' }] })).toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }));
      expect(sales.listSales()).toEqual([]);
    } finally { cleanup(); }
  });

  it('rolls back all sale lines when a later line is unavailable', () => {
    const { inventory, sales, main, pork, beef, cleanup } = createLedger();
    try {
      inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: pork.id, quantity: 5, unit: 'piece' }] });
      expect(() => sales.completeSale({ locationId: main.id, paymentCentavos: 10000, lines: [
        { productId: pork.id, quantity: 2, unit: 'piece' }, { productId: beef.id, quantity: 1, unit: 'piece' },
      ] })).toThrowError(expect.objectContaining({ code: 'INSUFFICIENT_STOCK' }));
      expect(inventory.getBalances(main.id)).toEqual([expect.objectContaining({ productId: pork.id, quantityPieces: 5 })]);
      expect(sales.listSales()).toEqual([]);
      expect(inventory.getMovementHistory({ movementType: 'sale' })).toEqual([]);
    } finally { cleanup(); }
  });

  it('serializes last-stock sales and rejects the sale that arrives second', () => {
    const { inventory, sales, main, pork, cleanup } = createLedger();
    try {
      inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: pork.id, quantity: 1, unit: 'piece' }] });
      sales.completeSale({ locationId: main.id, paymentCentavos: 300, lines: [{ productId: pork.id, quantity: 1, unit: 'piece' }] });
      expect(() => sales.completeSale({ locationId: main.id, paymentCentavos: 300, lines: [{ productId: pork.id, quantity: 1, unit: 'piece' }] })).toThrowError(expect.objectContaining({ code: 'INSUFFICIENT_STOCK' }));
      expect(inventory.getBalances(main.id)).toEqual([]);
    } finally { cleanup(); }
  });

  it('voids a completed sale with linked positive reversals and rejects a second void', () => {
    const { db, inventory, sales, main, pork, cleanup } = createLedger();
    try {
      inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: pork.id, quantity: 5, unit: 'piece' }] });
      const sale = sales.completeSale({ locationId: main.id, paymentCentavos: 300, lines: [{ productId: pork.id, quantity: 1, unit: 'piece' }] });
      expect(sales.voidSale(sale.id, 'Entered twice')).toMatchObject({ id: sale.id, status: 'voided' });
      expect(() => sales.voidSale(sale.id, 'Again')).toThrowError(expect.objectContaining({ code: 'ALREADY_VOIDED' }));
      expect(inventory.getBalances(main.id)).toEqual([expect.objectContaining({ productId: pork.id, quantityPieces: 5 })]);
      expect(inventory.getMovementHistory({ locationId: main.id })).toEqual(expect.arrayContaining([
        expect.objectContaining({ movementType: 'sale', quantityPieces: -1 }),
        expect.objectContaining({ movementType: 'sale_void', quantityPieces: 1, relatedEntityType: 'sale_void', relatedEntityId: sale.id, note: 'Entered twice' }),
      ]));
      expect((db.prepare('SELECT status FROM sales WHERE id = ?').get(sale.id) as { status: string }).status).toBe('voided');
    } finally { cleanup(); }
  });

  it('rejects a sale with an unset zero selling price', () => {
    const { db, inventory, sales, main, pork, cleanup } = createLedger();
    try {
      inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: pork.id, quantity: 1, unit: 'piece' }] });
      db.prepare('UPDATE products SET selling_price_per_piece_centavos = 0 WHERE id = ?').run(pork.id);
      expect(() => sales.completeSale({ locationId: main.id, paymentCentavos: 0, lines: [{ productId: pork.id, quantity: 1, unit: 'piece' }] })).toThrowError(expect.objectContaining({ code: 'PRICE_NOT_SET' }));
    } finally { cleanup(); }
  });
});
