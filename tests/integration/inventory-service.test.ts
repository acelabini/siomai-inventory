import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../src/main/db/test-database';
import { migrateDatabase } from '../../src/main/db/migrations';
import { CatalogService } from '../../src/main/services/catalog-service';
import { InventoryService } from '../../src/main/services/inventory-service';

function createLedger() {
  const { db, cleanup } = createTestDatabase();
  migrateDatabase(db);
  const catalog = new CatalogService(db);
  catalog.completeSetup({ businessName: 'Cart ni Ate', locationName: 'Main Cart', sampleProductIds: ['siomai-pork', 'siomai-beef'], openingStock: [] });
  const [main] = catalog.listLocations();
  const branch = catalog.saveLocation({ name: 'Market Cart' });
  const pork = catalog.listProducts().find((product) => product.id === 'siomai-pork')!;
  const beef = catalog.listProducts().find((product) => product.id === 'siomai-beef')!;
  return { db, catalog, inventory: new InventoryService(db), main, branch, pork, beef, cleanup };
}

describe('InventoryService', () => {
  it('sets opening stock and keeps balances equal to signed ledger movements', () => {
    const { inventory, main, pork, cleanup } = createLedger();
    try {
      const receipt = inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: pork.id, quantity: 2, unit: 'pack' }] });
      expect(receipt.lines[0]).toMatchObject({ productId: pork.id, quantityPieces: 132, balancePieces: 132 });
      expect(inventory.getBalances(main.id)).toEqual([expect.objectContaining({ productId: pork.id, quantityPieces: 132 })]);
      expect(inventory.getMovementHistory({ locationId: main.id })).toEqual([expect.objectContaining({ movementType: 'opening_balance', quantityPieces: 132 })]);
      expect(inventory.getLedgerBalance(main.id, pork.id)).toBe(132);
    } finally { cleanup(); }
  });

  it('remembers a zero opening balance so a product cannot be opened twice', () => {
    const { inventory, main, pork, cleanup } = createLedger();
    try {
      inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: pork.id, quantity: 0, unit: 'piece' }] });
      expect(() => inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: pork.id, quantity: 0, unit: 'piece' }] })).toThrowError(expect.objectContaining({ code: 'OPENING_STOCK_ALREADY_SET' }));
    } finally { cleanup(); }
  });

  it('records multiple replenishment lines and snapshots their purchase costs', () => {
    const { db, inventory, main, pork, beef, cleanup } = createLedger();
    try {
      const receipt = inventory.recordReplenishment({ locationId: main.id, lines: [
        { productId: pork.id, quantity: 1.5, unit: 'pack' },
        { productId: beef.id, quantity: 12, unit: 'piece' },
      ] });
      expect(receipt.lines.map((line) => [line.productId, line.quantityPieces, line.balancePieces, line.lineCostCentavos])).toEqual([
        [pork.id, 99, 99, 21900], [beef.id, 12, 12, 2800],
      ]);
      catalogCost(db, pork.id, 99999);
      expect(inventory.getMovementHistory({ locationId: main.id, productId: pork.id })[0]).toMatchObject({
        movementType: 'replenishment', unitCostCentavos: 14600, lineCostCentavos: 21900,
      });
    } finally { cleanup(); }
  });

  it('records transfers as paired immutable movements and rejects same-location transfers', () => {
    const { db, inventory, main, branch, pork, cleanup } = createLedger();
    try {
      inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: pork.id, quantity: 1, unit: 'pack' }] });
      const receipt = inventory.transferStock({ fromLocationId: main.id, toLocationId: branch.id, lines: [{ productId: pork.id, quantity: 10, unit: 'piece' }] });
      expect(receipt.lines[0]).toMatchObject({ quantityPieces: 10, fromBalancePieces: 56, toBalancePieces: 10 });
      expect((db.prepare('SELECT COUNT(*) AS count FROM transfer_batches WHERE id = ?').get(receipt.id) as { count: number | bigint }).count).toBe(1n);
      expect(inventory.getMovementHistory({ productId: pork.id })).toEqual(expect.arrayContaining([
        expect.objectContaining({ locationId: main.id, movementType: 'transfer_out', quantityPieces: -10 }),
        expect.objectContaining({ locationId: branch.id, movementType: 'transfer_in', quantityPieces: 10 }),
      ]));
      expect(() => inventory.transferStock({ fromLocationId: main.id, toLocationId: main.id, lines: [{ productId: pork.id, quantity: 1, unit: 'piece' }] })).toThrowError(expect.objectContaining({ code: 'SAME_LOCATION' }));
    } finally { cleanup(); }
  });

  it('rolls back every transfer line when any source balance is insufficient', () => {
    const { inventory, main, branch, pork, beef, cleanup } = createLedger();
    try {
      inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: pork.id, quantity: 5, unit: 'piece' }] });
      expect(() => inventory.transferStock({ fromLocationId: main.id, toLocationId: branch.id, lines: [
        { productId: pork.id, quantity: 3, unit: 'piece' }, { productId: beef.id, quantity: 1, unit: 'pack' },
      ] })).toThrowError(expect.objectContaining({ code: 'INSUFFICIENT_STOCK' }));
      expect(inventory.getBalances(main.id)).toEqual([expect.objectContaining({ productId: pork.id, quantityPieces: 5 })]);
      expect(inventory.getBalances(branch.id)).toEqual([]);
      expect(inventory.getMovementHistory({ movementType: 'transfer_out' })).toEqual([]);
    } finally { cleanup(); }
  });

  it('records expected and counted stock with a signed discrepancy and requires a reason', () => {
    const { inventory, main, pork, cleanup } = createLedger();
    try {
      inventory.setOpeningStock({ locationId: main.id, lines: [{ productId: pork.id, quantity: 1, unit: 'pack' }] });
      expect(() => inventory.submitStockCount({ locationId: main.id, lines: [{ productId: pork.id, countedQuantity: 60, unit: 'piece' }] })).toThrowError(expect.objectContaining({ code: 'DISCREPANCY_REASON_REQUIRED' }));
      const receipt = inventory.submitStockCount({ locationId: main.id, lines: [{ productId: pork.id, countedQuantity: 60, unit: 'piece', reason: 'Damaged during prep' }] });
      expect(receipt.lines[0]).toMatchObject({ expectedPieces: 66, countedPieces: 60, differencePieces: -6, balancePieces: 60 });
      expect(inventory.getMovementHistory({ movementType: 'count_adjustment' })).toEqual([expect.objectContaining({ quantityPieces: -6, note: 'Damaged during prep' })]);
    } finally { cleanup(); }
  });
});

function catalogCost(db: ReturnType<typeof createTestDatabase>['db'], productId: string, cost: number) {
  db.prepare('UPDATE products SET purchase_cost_per_pack_centavos = ? WHERE id = ?').run(cost, productId);
}
