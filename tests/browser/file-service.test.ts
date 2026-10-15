import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrowserInventoryApi } from '../../src/browser/browser-inventory-api';
import { createTestDatabase } from './test-database';

describe('browser files and imports', () => {
  let fixture: ReturnType<typeof createTestDatabase>;
  const downloads: Array<{ name: string; blob: Blob }> = [];
  beforeEach(() => { fixture = createTestDatabase(); downloads.length = 0; });
  afterEach(async () => fixture.cleanup());
  const api = (pickFile = async () => null as { name: string; size: number; text(): Promise<string> } | null) => createBrowserInventoryApi({ db: fixture.db, pickFile, download: async (blob, name) => { downloads.push({ blob, name }); }, now: () => new Date('2026-10-15T01:02:03.000Z'), persistStorage: async () => true });

  it('treats picker cancellation as a no-op and rejects files over 5 MB before reading', async () => {
    expect(await api().chooseCsvImportFile()).toBeNull();
    await expect(api(async () => ({ name: 'large.csv', size: 5_000_001, text: async () => { throw new Error('must not read'); } })).chooseCsvImportFile()).rejects.toThrow(/5 MB/);
    expect(await api(async () => ({ name: 'stock.csv', size: 3, text: async () => 'csv' })).chooseCsvImportFile()).toEqual({ fileName: 'stock.csv', csv: 'csv' });
  });

  it('previews and commits products, opening stock and aggregate imports with exact desktop mappings', async () => {
    const ledger = api();
    const { locationId } = await ledger.completeSetup({ businessName: 'Cart', locationName: 'Main', sampleProductIds: [], openingStock: [] });
    const cases = [
      { kind: 'products' as const, csv: 'sku,name,pieces per pack,cost per pack,selling price per piece,selling price per pack\nPORK,Pork,10,100.01,15,140' },
      { kind: 'opening-stock' as const, csv: 'sku,quantity,unit\nPORK,2,pack' },
      { kind: 'spreadsheet-aggregate' as const, csv: 'product name,pieces per pack,pack quantity,replenishment quantity,pieces,total cost\nBeef,10,1,2,3,120' },
    ];
    for (const request of cases) {
      const preview = await ledger.previewCsvImport({ ...request, locationId });
      expect(preview).toMatchObject({ validRows: 1, invalidRows: 0, fileErrors: 0, errors: [] });
      expect(await ledger.commitCsvImport({ ...request, locationId, token: preview.token, contentHash: preview.contentHash })).toEqual({ importedRows: 1, aggregate: request.kind === 'spreadsheet-aggregate' });
    }
    const products = await ledger.listProducts();
    const balances = await ledger.getBalances(locationId);
    expect(balances.find((b) => b.productId === products.find((p) => p.sku === 'PORK')!.id)?.quantityPieces).toBe(20);
    expect(balances.find((b) => b.productId === products.find((p) => p.name === 'Beef')!.id)?.quantityPieces).toBe(33);
    expect(await ledger.listSales()).toEqual([]);
  });

  it('rejects changed CSV content and revalidates catalog changes without partial writes', async () => {
    const ledger = api();
    const request = { kind: 'products' as const, csv: 'sku,name,pieces per pack,cost per pack,selling price per piece,selling price per pack\nA,Pork,10,100,15,140' };
    const preview = await ledger.previewCsvImport(request);
    await expect(ledger.commitCsvImport({ ...request, csv: `${request.csv}\nB,Beef,10,100,15,140`, token: preview.token, contentHash: preview.contentHash })).rejects.toThrow(/preview|changed/i);
    await ledger.saveProduct({ sku: 'A', name: 'Other', piecesPerPack: 10, purchaseCostPerPackCentavos: 100, sellingPricePerPieceCentavos: 100, sellingPricePerPackCentavos: 100, lowStockThresholdPieces: 0 });
    await expect(ledger.commitCsvImport({ ...request, token: preview.token, contentHash: preview.contentHash })).rejects.toThrow(/invalid/i);
    expect(await ledger.listProducts()).toHaveLength(1);
  });

  it('rolls back product writes when opening stock exceeds the operation line limit', async () => {
    const ledger = api();
    const { locationId } = await ledger.completeSetup({ businessName: 'Cart', locationName: 'Main', sampleProductIds: [], openingStock: [] });
    const request = { kind: 'products' as const, locationId, csv: 'sku,name,pieces per pack,cost per pack,selling price per piece,selling price per pack,opening packs\nA,Pork,10,100,15,140,1' };
    const preview = await ledger.previewCsvImport(request);
    // The business service rejects >100 input lines, after product writes have begun.
    const many = { ...request, csv: request.csv.split('\n')[0] + '\n' + Array.from({ length: 101 }, (_, n) => `S${n},Name${n},10,100,15,140,1`).join('\n') };
    const manyPreview = await ledger.previewCsvImport(many);
    await expect(ledger.commitCsvImport({ ...many, token: manyPreview.token, contentHash: manyPreview.contentHash })).rejects.toThrow();
    expect(await ledger.listProducts()).toEqual([]);
    await ledger.commitCsvImport({ ...request, token: preview.token, contentHash: preview.contentHash });
    await expect(ledger.commitCsvImport({ ...request, token: preview.token, contentHash: preview.contentHash })).rejects.toThrow(/preview/i);
  });

  it('exports report CSV content with deterministic kind/date filenames', async () => {
    const ledger = api();
    expect(await ledger.exportReportCsv('profit', { date: '2026-10-14' })).toBe(true);
    expect(downloads[0].name).toBe('siomai-profit-2026-10-14.csv');
    expect(downloads[0].blob.type).toBe('text/csv;charset=utf-8');
    expect(await downloads[0].blob.text()).toBe('date,revenue,cost,grossProfit,label,note\r\n2026-10-14,₱0.00,₱0.00,₱0.00,,\r\n');
    for (const kind of ['sales', 'movements', 'valuation', 'discrepancies', 'low-stock'] as const) await ledger.exportReportCsv(kind, { date: '2026-10-14' });
    expect(downloads.map((d) => d.name)).toEqual(['siomai-profit-2026-10-14.csv', 'siomai-sales-2026-10-14.csv', 'siomai-movements-2026-10-14.csv', 'siomai-valuation-2026-10-14.csv', 'siomai-discrepancies-2026-10-14.csv', 'siomai-low-stock-2026-10-14.csv']);
  });
  it('propagates download failures without reporting a successful export or backup', async () => {
    const ledger = createBrowserInventoryApi({ db: fixture.db, download: async () => { throw new Error('Download failed'); } });
    await expect(ledger.exportReportCsv('sales')).rejects.toThrow('Download failed');
    await expect(ledger.createManualBackup()).rejects.toThrow('Download failed');
  });
  it('expires import previews after five minutes', async () => {
    let now = new Date('2026-10-15T00:00:00.000Z');
    const ledger = createBrowserInventoryApi({ db: fixture.db, now: () => now });
    const request = { kind: 'products' as const, csv: 'sku,name,pieces per pack,cost per pack,selling price per piece,selling price per pack\nA,Pork,10,100,15,140' };
    const preview = await ledger.previewCsvImport(request);
    now = new Date('2026-10-15T00:05:00.000Z');
    await expect(ledger.commitCsvImport({ ...request, token: preview.token, contentHash: preview.contentHash })).rejects.toThrow(/expired/i);
    expect(await ledger.listProducts()).toEqual([]);
  });
});
