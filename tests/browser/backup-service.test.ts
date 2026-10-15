import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrowserInventoryApi } from '../../src/browser/browser-inventory-api';
import type { BrowserBackup } from '../../src/browser/backup-format';
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
  async function completedSaleLedger() {
    const ledger = api();
    const location = await ledger.saveLocation({ name: 'Main' });
    const pork = await ledger.saveProduct({ sku: 'PORK', name: 'Pork', piecesPerPack: 10, purchaseCostPerPackCentavos: 1000, sellingPricePerPieceCentavos: 150, sellingPricePerPackCentavos: 1400, lowStockThresholdPieces: 0 });
    const beef = await ledger.saveProduct({ ...pork, id: undefined, sku: 'BEEF', name: 'Beef' });
    await ledger.setOpeningStock({ locationId: location.id, lines: [pork, beef].map((product) => ({ productId: product.id, quantity: 10, unit: 'piece' as const })) });
    const sale = await ledger.completeSale({ locationId: location.id, paymentCentavos: 1000, lines: [
      { productId: pork.id, quantity: 1, unit: 'piece' }, { productId: pork.id, quantity: 2, unit: 'piece' }, { productId: beef.id, quantity: 1, unit: 'piece' },
    ] });
    return { ledger, sale, location, pork, beef };
  }
  it.each(['changed-line-quantity', 'missing-sale-product', 'wrong-sale-quantity', 'duplicate-sale-movement', 'split-sale-movement', 'completed-with-void', 'voided-without-void', 'voided-missing-product', 'wrong-void-quantity', 'duplicate-void-movement', 'voided-without-sale'])('rejects %s before issuing a restore token and preserves the live ledger', async (mutation) => {
    const { ledger, sale, pork, beef } = await completedSaleLedger();
    await ledger.createManualBackup();
    const backup: BrowserBackup = JSON.parse(await downloaded!.blob.text());
    const movements = backup.tables.stockMovements;
    const porkSale = movements.find((row) => row.movementType === 'sale' && row.productId === pork.id)!;
    const beefSale = movements.find((row) => row.movementType === 'sale' && row.productId === beef.id)!;
    if (mutation === 'changed-line-quantity') {
      const line = backup.tables.saleLines.find((row) => row.saleId === sale.id && row.productId === pork.id && row.lineIndex === 0)!;
      line.quantityPieces = 100;
      line.enteredQuantity = '100';
    }
    if (mutation === 'missing-sale-product') movements.splice(movements.indexOf(beefSale), 1);
    if (mutation === 'wrong-sale-quantity') porkSale.quantityPieces = -2;
    if (mutation === 'duplicate-sale-movement') movements.push({ ...porkSale, id: crypto.randomUUID() });
    if (mutation === 'split-sale-movement') {
      porkSale.quantityPieces = -1;
      movements.push({ ...porkSale, id: crypto.randomUUID(), quantityPieces: -2 });
    }
    const addVoid = (source: typeof porkSale, quantity = -source.quantityPieces) => movements.push({ ...source, id: crypto.randomUUID(), movementType: 'sale_void', relatedEntityType: 'sale_void', quantityPieces: quantity, unitCostCentavos: null, lineCostCentavos: null });
    if (mutation === 'completed-with-void') addVoid(porkSale);
    if (mutation.startsWith('voided-') || mutation.includes('void-')) backup.tables.sales[0].status = 'voided';
    if (mutation === 'voided-missing-product') addVoid(porkSale);
    if (mutation === 'wrong-void-quantity') { addVoid(porkSale, 2); addVoid(beefSale); }
    if (mutation === 'duplicate-void-movement') { addVoid(porkSale); addVoid(beefSale); addVoid(porkSale); }
    if (mutation === 'voided-without-sale') { movements.splice(movements.indexOf(porkSale), 1); addVoid(porkSale); addVoid(beefSale); }
    // Preserve movement/balance equality so only operation reconciliation can reject these corruptions.
    for (const balance of backup.tables.inventoryBalances) balance.quantityPieces = movements.filter((row) => row.locationId === balance.locationId && row.productId === balance.productId).reduce((sum, row) => sum + row.quantityPieces, 0);
    selected = JSON.stringify(backup);
    const before = await snapshot();
    await expect(ledger.chooseBackupFile()).rejects.toThrow(/backup/i);
    expect(await snapshot()).toEqual(before);
  });
  it('restores valid grouped repeated-product sales and voids exactly the sold pieces', async () => {
    const { ledger, sale, location } = await completedSaleLedger();
    await ledger.createManualBackup();
    selected = await downloaded!.blob.text();
    const choice = await ledger.chooseBackupFile();
    expect(await ledger.restoreBackup(choice!.token)).toBe(true);
    await ledger.voidSale(sale.id, 'Restored sale canceled');
    expect((await ledger.getBalances(location.id)).map((row) => row.quantityPieces)).toEqual([10, 10]);
    await ledger.createManualBackup();
    selected = await downloaded!.blob.text();
    const voidedChoice = await ledger.chooseBackupFile();
    expect(await ledger.restoreBackup(voidedChoice!.token)).toBe(true);
    expect((await ledger.getBalances(location.id)).map((row) => row.quantityPieces)).toEqual([10, 10]);
  });
  it('allows only one claimant when the same restore token is submitted concurrently', async () => {
    const ledger = await populated();
    await ledger.createManualBackup();
    selected = await downloaded!.blob.text();
    const choice = await ledger.chooseBackupFile();
    const before = await snapshot();
    const results = await Promise.allSettled([ledger.restoreBackup(choice!.token), ledger.restoreBackup(choice!.token)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toEqual([{ status: 'fulfilled', value: true }]);
    expect(results.filter((result) => result.status === 'rejected')).toEqual([expect.objectContaining({ reason: expect.any(Error) })]);
    expect(await snapshot()).toEqual(before);
  });
  it('restores the failed claimant for retry without admitting a concurrent claimant', async () => {
    const ledger = await populated();
    await ledger.createManualBackup();
    selected = await downloaded!.blob.text();
    const choice = await ledger.chooseBackupFile();
    const before = await snapshot();
    const fail = () => { throw new Error('Simulated storage failure'); };
    fixture.db.saleLines.hook('creating', fail);
    const results = await Promise.allSettled([ledger.restoreBackup(choice!.token), ledger.restoreBackup(choice!.token)]);
    fixture.db.saleLines.hook('creating').unsubscribe(fail);
    expect(results.filter((result) => result.status === 'rejected' && /storage failure/.test(String(result.reason)))).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected' && /progress|expired/.test(String(result.reason)))).toHaveLength(1);
    expect(await snapshot()).toEqual(before);
    expect(await ledger.restoreBackup(choice!.token)).toBe(true);
    await expect(ledger.restoreBackup(choice!.token)).rejects.toThrow(/expired/i);
  });
  it('does not overwrite a newer selection when the previous claimant fails', async () => {
    const ledger = await populated();
    await ledger.createManualBackup();
    selected = await downloaded!.blob.text();
    const first = await ledger.chooseBackupFile();
    const fail = () => { throw new Error('Simulated storage failure'); };
    fixture.db.saleLines.hook('creating', fail);
    const restoring = ledger.restoreBackup(first!.token).then(() => null, (error: unknown) => error);
    const second = await ledger.chooseBackupFile();
    const failure = await restoring;
    fixture.db.saleLines.hook('creating').unsubscribe(fail);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toMatch(/storage failure/i);
    await expect(ledger.restoreBackup(first!.token)).rejects.toThrow(/expired/i);
    expect(await ledger.restoreBackup(second!.token)).toBe(true);
  });
});
