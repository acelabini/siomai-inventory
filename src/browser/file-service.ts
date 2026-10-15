import type { InventoryApi } from '../shared/contracts';
import { csvImportCommitSchema, csvImportRequestSchema, reportExportSchema, type CsvImportCommitInput, type CsvImportRequest, type ReportFilter } from '../shared/schemas';
import { validateCsvImport } from '../shared/csv-import';
import { ExportService } from '../shared/csv-export';
import { BrowserCatalogService } from './catalog-service';
import { BrowserInventoryService } from './inventory-service';
import { BrowserReportService } from './report-service';
import type { BrowserDatabase } from './db';
import { browserTableNames, snapshotBrowserBackup, validateBrowserBackup, type BrowserBackup } from './backup-format';
import { downloadBrowserFile, pickBrowserFile, type DownloadBrowserFile, type PickBrowserFile } from './download';

export type BrowserFileOptions = { pickFile?: PickBrowserFile; download?: DownloadBrowserFile; now?: () => Date };
const tokenLifetimeMs = 5 * 60_000;
async function hash(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
const requestText = (request: CsvImportRequest) => JSON.stringify({ csv: request.csv, kind: request.kind, locationId: request.locationId ?? '', mapping: request.mapping ?? {} });

export class BrowserFileService implements Pick<InventoryApi, 'chooseCsvImportFile' | 'previewCsvImport' | 'commitCsvImport' | 'exportReportCsv' | 'createManualBackup' | 'chooseBackupFile' | 'restoreBackup'> {
  private readonly pick: PickBrowserFile;
  private readonly download: DownloadBrowserFile;
  private readonly now: () => Date;
  private readonly previews = new Map<string, { hash: string; expires: number }>();
  private selection?: { token: string; backup: BrowserBackup; expires: number };
  private restoringSelection?: NonNullable<BrowserFileService['selection']>;
  private selectionRevision = 0;
  // Retained for this page's lifetime so a successful replacement still has a recoverable prior snapshot.
  private recoveryBackup?: BrowserBackup;
  private readonly catalog: BrowserCatalogService;
  private readonly inventory: BrowserInventoryService;
  private readonly reports: BrowserReportService;
  constructor(private readonly db: BrowserDatabase, options: BrowserFileOptions = {}) {
    this.pick = options.pickFile ?? pickBrowserFile;
    this.download = options.download ?? downloadBrowserFile;
    this.now = options.now ?? (() => new Date());
    this.catalog = new BrowserCatalogService(db);
    this.inventory = new BrowserInventoryService(db);
    this.reports = new BrowserReportService(db);
  }

  async chooseCsvImportFile() {
    const file = await this.pick('.csv,text/csv,text/comma-separated-values');
    if (!file) return null;
    if (file.size > 5_000_000) throw new Error('CSV files must be 5 MB or smaller.');
    return { fileName: file.name, csv: await file.text() };
  }

  private async validate(request: CsvImportRequest, hashes: Map<string, string>) {
    return validateCsvImport(request, await this.catalog.listProducts(), await this.catalog.listProducts({ includeArchived: true }), await this.catalog.listLocations(), (name) => {
      if (!hashes.has(name)) hashes.set(name, '');
      return hashes.get(name)!;
    });
  }
  private async prepareHashes(request: CsvImportRequest) {
    const hashes = new Map<string, string>();
    await this.validate(request, hashes);
    await Promise.all([...hashes.keys()].map(async (name) => { hashes.set(name, await hash(name)); }));
    return hashes;
  }
  async previewCsvImport(input: CsvImportRequest) {
    const request = csvImportRequestSchema.parse(input);
    const hashes = await this.prepareHashes(request);
    const validation = await this.db.transaction('r', this.db.products, this.db.locations, () => this.validate(request, hashes));
    const token = crypto.randomUUID();
    const contentHash = await hash(requestText(request));
    const now = this.now().valueOf();
    for (const [key, entry] of this.previews) if (entry.expires <= now) this.previews.delete(key);
    if (this.previews.size >= 10) this.previews.delete(this.previews.keys().next().value!);
    this.previews.set(token, { hash: contentHash, expires: now + tokenLifetimeMs });
    const invalid = new Set(validation.errors.filter((error) => error.row > 1).map((error) => error.row));
    const validRows = validation.rows.filter((row) => row.errors.length === 0 && !invalid.has(row.row)).length;
    return { token, contentHash, kind: request.kind, validRows, invalidRows: invalid.size,
      fileErrors: validation.fileErrors, errors: validation.errors, columns: validation.headers,
      summary: request.kind === 'spreadsheet-aggregate' ? 'Imported aggregate stock data. No transaction sales will be created.' : `${validRows} valid row${validRows === 1 ? '' : 's'} ready to import.` };
  }
  async commitCsvImport(input: CsvImportCommitInput) {
    const request = csvImportCommitSchema.parse(input);
    const preview = this.previews.get(request.token);
    if (!preview || preview.expires <= this.now().valueOf() || preview.hash !== request.contentHash || await hash(requestText(request)) !== request.contentHash) throw new Error('The preview has expired or the CSV content changed. Preview the file again.');
    const hashes = await this.prepareHashes(request);
    return this.db.transaction('rw', this.db.tables, async () => {
      // Concurrent commits must not consume the same preview twice.
      if (this.previews.get(request.token) !== preview) throw new Error('The preview has expired. Preview the file again.');
      const validation = await this.validate(request, hashes);
      if (validation.errors.length) throw new Error('The import contains invalid rows. Correct them and preview again.');
      const opening: Array<{ productId: string; quantity: number; unit: 'piece' }> = [];
      const replenishment: Array<{ productId: string; quantity: number; unit: 'pack' }> = [];
      for (const row of validation.rows) {
        let productId = row.productId;
        if (row.product) {
          productId = (await this.catalog.saveProduct({ ...row.product, id: undefined })).id;
        }
        if (productId && row.openingPieces !== undefined && request.locationId) opening.push({ productId, quantity: row.openingPieces, unit: 'piece' });
        if (productId && row.replenishmentPacks && request.locationId) replenishment.push({ productId, quantity: row.replenishmentPacks, unit: 'pack' });
      }
      if (opening.length && request.locationId) await this.inventory.setOpeningStock({ locationId: request.locationId, lines: opening });
      if (replenishment.length && request.locationId) await this.inventory.recordReplenishment({ locationId: request.locationId, note: 'Imported aggregate spreadsheet data', lines: replenishment });
      return { importedRows: validation.rows.length, aggregate: request.kind === 'spreadsheet-aggregate' };
    }).then((result) => { this.previews.delete(request.token); return result; });
  }

  async exportReportCsv(kind: Parameters<InventoryApi['exportReportCsv']>[0], filter?: ReportFilter) {
    const request = reportExportSchema.parse({ kind, filter });
    const methods = { profit: 'getProfitReport', sales: 'getSalesReport', movements: 'getMovementReport', valuation: 'getValuationReport', discrepancies: 'getDiscrepancyReport', 'low-stock': 'getLowStockReport' } as const;
    const report = await this.reports[methods[request.kind]](request.filter);
    const csv = new ExportService().reportToCsv(request.kind, report);
    await this.download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `siomai-${request.kind}-${report.date}.csv`);
    return true;
  }
  async createManualBackup() {
    const backup = await snapshotBrowserBackup(this.db, this.now());
    const fileName = `siomai-backup-${backup.createdAt.replace(/[:.]/g, '-')}.json`;
    await this.download(new Blob([JSON.stringify(backup)], { type: 'application/json' }), fileName);
    return { fileName };
  }
  async chooseBackupFile() {
    this.selectionRevision++;
    this.selection = undefined;
    const file = await this.pick('.json,application/json');
    if (!file) return null;
    let content: unknown;
    try { content = JSON.parse(await file.text()); }
    catch { throw new Error('The backup file is not valid JSON.'); }
    const backup = validateBrowserBackup(content);
    const token = crypto.randomUUID();
    this.selection = { token, backup, expires: this.now().valueOf() + tokenLifetimeMs };
    return { token, fileName: file.name };
  }
  async restoreBackup(token: string) {
    if (this.restoringSelection) throw new Error('A backup restore is already in progress.');
    const selection = this.selection;
    if (!selection || selection.token !== token || selection.expires <= this.now().valueOf()) throw new Error('The backup selection has expired. Select the backup again.');
    const backup = validateBrowserBackup(selection.backup);
    const revision = this.selectionRevision;
    // Claim before yielding: a queued IndexedDB transaction must not admit a second caller.
    this.selection = undefined;
    this.restoringSelection = selection;
    try {
      await this.db.transaction('rw', this.db.tables, async () => {
        this.recoveryBackup = await snapshotBrowserBackup(this.db, this.now());
        for (const name of browserTableNames) {
          await this.db.table(name).clear();
          await this.db.table(name).bulkAdd(backup.tables[name]);
        }
      });
    } catch (cause) {
      // Retry only this claimant; choosing another file supersedes its selection.
      if (this.restoringSelection === selection && this.selectionRevision === revision) this.selection = selection;
      throw cause;
    } finally {
      if (this.restoringSelection === selection) this.restoringSelection = undefined;
    }
    this.previews.clear();
    return true;
  }
}
