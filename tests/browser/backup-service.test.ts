import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrowserInventoryApi } from '../../src/browser/browser-inventory-api';
import { createTestDatabase } from './test-database';

describe('browser backup recovery', () => {
  let fixture: ReturnType<typeof createTestDatabase>;
  let selected: string | null;
  let downloaded: { blob: Blob; name: string };
  beforeEach(() => { fixture = createTestDatabase(); selected = null; });
  afterEach(async () => fixture.cleanup());
  const api = () => createBrowserInventoryApi({ db: fixture.db, pickFile: async () => selected === null ? null : ({ name: 'ledger.json', size: selected.length, text: async () => selected! }), download: async (blob, name) => { downloaded = { blob, name }; }, persistStorage: async () => false, now: () => new Date('2026-10-15T01:02:03Z') });
  const snapshot = () => Promise.all(fixture.db.tables.map(async (table) => [table.name, await table.toArray()]));
  async function populated() {
    const ledger = api();
    const setup = await ledger.completeSetup({ businessName: 'Cart', locationName: 'Main', sampleProductIds: [], openingStock: [] });
    const product = await ledger.saveProduct({ sku: 'A', name: 'Pork', piecesPerPack: 10, purchaseCostPerPackCentavos: 1000, sellingPricePerPieceCentavos: 150, sellingPricePerPackCentavos: 1400, lowStockThresholdPieces: 0 });
    await ledger.setOpeningStock({ locationId: setup.locationId, lines: [{ productId: product.id, quantity: 100, unit: 'piece' }] });
    await ledger.recordReplenishment({ locationId: setup.locationId, lines: [{ productId: product.id, quantity: 1, unit: 'pack' }] });
    const second = await ledger.saveLocation({ name: 'Other' });
    await ledger.transferStock({ fromLocationId: setup.locationId, toLocationId: second.id, lines: [{ productId: product.id, quantity: 5, unit: 'piece' }] });
    await ledger.submitStockCount({ locationId: second.id, lines: [{ productId: product.id, countedQuantity: 4, unit: 'piece', reason: 'One damaged' }] });
    const sale = await ledger.completeSale({ locationId: setup.locationId, paymentCentavos: 1000, lines: [{ productId: product.id, quantity: 1, unit: 'piece' }, { productId: product.id, quantity: 2, unit: 'piece' }] });
    await ledger.voidSale(sale.id, 'Duplicate');
    await ledger.archiveProduct(product.id);
    return ledger;
  }
  it('exports every table and restores a full ledger atomically with a one-use selection token', async () => {
    const ledger = await populated();
    const before = await snapshot();
    expect(await ledger.createManualBackup()).toEqual({ fileName: 'siomai-backup-2026-10-15T01-02-03-000Z.json' });
    selected = await downloaded!.blob.text();
    expect(JSON.parse(selected)).toMatchObject({ format: 'siomai-inventory-web-backup', version: 1, createdAt: '2026-10-15T01:02:03.000Z' });
    const choice = await ledger.chooseBackupFile();
    await ledger.saveSettings({ businessName: 'Changed' });
    expect(await ledger.restoreBackup(choice!.token)).toBe(true);
    expect(await snapshot()).toEqual(before);
    await expect(ledger.restoreBackup(choice!.token)).rejects.toThrow(/expired|select/i);
  });
  it.each(['version', 'missing-table', 'invalid-record', 'dangling-product', 'dangling-movement', 'duplicate-id', 'line-negative', 'line-duplicate', 'line-gap'])('rejects %s backups and preserves the current ledger', async (mutation) => {
    const ledger = await populated();
    await ledger.createManualBackup();
    const backup = JSON.parse(await downloaded!.blob.text());
    if (mutation === 'version') backup.version = 2;
    if (mutation === 'missing-table') delete backup.tables.settings;
    if (mutation === 'invalid-record') backup.tables.products[0].piecesPerPack = 0;
    if (mutation === 'dangling-product') backup.tables.saleLines[0].productId = 'missing';
    if (mutation === 'dangling-movement') backup.tables.stockMovements.find((m: { movementType: string }) => m.movementType === 'sale').relatedEntityId = 'missing';
    if (mutation === 'duplicate-id') backup.tables.locations.push(backup.tables.locations[0]);
    if (mutation === 'line-negative') backup.tables.saleLines[0].lineIndex = -1;
    if (mutation === 'line-duplicate') backup.tables.saleLines[1].lineIndex = backup.tables.saleLines[0].lineIndex;
    if (mutation === 'line-gap') backup.tables.saleLines[1].lineIndex = 4;
    const before = await snapshot();
    selected = JSON.stringify(backup);
    await expect(ledger.chooseBackupFile()).rejects.toThrow(/backup/i);
    expect(await snapshot()).toEqual(before);
  });
  it('treats cancellation normally and rejects malformed JSON', async () => {
    const ledger = api();
    expect(await ledger.chooseBackupFile()).toBeNull();
    selected = '{';
    await expect(ledger.chooseBackupFile()).rejects.toThrow(/backup/i);
  });
  it('rolls back a replacement that fails during the final table write and allows retry', async () => {
    const ledger = await populated();
    await ledger.createManualBackup();
    selected = await downloaded!.blob.text();
    const choice = await ledger.chooseBackupFile();
    await ledger.saveSettings({ businessName: 'Keep this current name' });
    const before = await snapshot();
    const fail = () => { throw new Error('Simulated storage failure'); };
    fixture.db.saleLines.hook('creating', fail);
    await expect(ledger.restoreBackup(choice!.token)).rejects.toThrow(/storage failure/i);
    fixture.db.saleLines.hook('creating').unsubscribe(fail);
    expect(await snapshot()).toEqual(before);
    expect(await ledger.restoreBackup(choice!.token)).toBe(true);
    expect((await ledger.getSettings()).businessName).toBe('Cart');
  });
  it('accepts exact small pack quantities serialized with an exponent by business services', async () => {
    const ledger = api();
    const location = await ledger.saveLocation({ name: 'Main' });
    const product = await ledger.saveProduct({ sku: 'TINY', name: 'Tiny', piecesPerPack: 10_000_000, purchaseCostPerPackCentavos: 1000, sellingPricePerPieceCentavos: 1, sellingPricePerPackCentavos: 1000, lowStockThresholdPieces: 0 });
    await ledger.recordReplenishment({ locationId: location.id, lines: [{ productId: product.id, quantity: 0.0000001, unit: 'pack' }] });
    await ledger.createManualBackup();
    selected = await downloaded!.blob.text();
    const choice = await ledger.chooseBackupFile();
    expect(await ledger.restoreBackup(choice!.token)).toBe(true);
    expect(await ledger.getBalances(location.id)).toEqual([{ locationId: location.id, productId: product.id, quantityPieces: 1 }]);
  });
  it.each(['missing-balances', 'incorrect-balance', 'truncated-movements'])('rejects a %s ledger without data loss', async (mutation) => {
    const ledger = await populated();
    await ledger.createManualBackup();
    const backup = JSON.parse(await downloaded!.blob.text());
    if (mutation === 'missing-balances') backup.tables.inventoryBalances = [];
    if (mutation === 'incorrect-balance') backup.tables.inventoryBalances[0].quantityPieces++;
    if (mutation === 'truncated-movements') backup.tables.stockMovements = [];
    selected = JSON.stringify(backup);
    const before = await snapshot();
    await expect(ledger.chooseBackupFile()).rejects.toThrow(/backup/i);
    expect(await snapshot()).toEqual(before);
  });
  it('validates every table record and reference before issuing a restore token', async () => {
    const ledger = await populated();
    await ledger.createManualBackup();
    const original = JSON.parse(await downloaded!.blob.text());
    const before = await snapshot();
    for (const name of Object.keys(original.tables)) {
      const backup = structuredClone(original);
      backup.tables[name].push({ invalid: true });
      selected = JSON.stringify(backup);
      await expect(ledger.chooseBackupFile(), name).rejects.toThrow(/backup/i);
    }
    for (const [table, field] of [
      ['inventoryBalances', 'locationId'], ['openingStockRecords', 'productId'], ['replenishments', 'locationId'],
      ['replenishmentLines', 'replenishmentId'], ['transfers', 'transferBatchId'], ['transferBatches', 'toLocationId'],
      ['stockCounts', 'locationId'], ['stockCountLines', 'stockCountId'], ['sales', 'locationId'],
    ]) {
      const backup = structuredClone(original);
      backup.tables[table][0][field] = 'missing';
      selected = JSON.stringify(backup);
      await expect(ledger.chooseBackupFile(), `${table}.${field}`).rejects.toThrow(/backup/i);
    }
    expect(await snapshot()).toEqual(before);
  });
  it('expires staged restore tokens and invalidates prior selections', async () => {
    let now = new Date('2026-10-15T00:00:00.000Z');
    const ledger = createBrowserInventoryApi({ db: fixture.db, now: () => now, pickFile: async () => ({ name: 'backup.json', size: selected!.length, text: async () => selected! }), download: async (blob) => { selected = await blob.text(); } });
    await ledger.createManualBackup();
    const first = await ledger.chooseBackupFile();
    const second = await ledger.chooseBackupFile();
    await expect(ledger.restoreBackup(first!.token)).rejects.toThrow(/expired/i);
    now = new Date('2026-10-15T00:05:00.000Z');
    await expect(ledger.restoreBackup(second!.token)).rejects.toThrow(/expired/i);
  });
});
