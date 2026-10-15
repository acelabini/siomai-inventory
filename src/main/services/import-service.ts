import type Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import type { CsvImportCommitInput, CsvImportRequest, ImportPreview } from '../../shared/schemas';
import { CatalogService } from './catalog-service';
import { InventoryService } from './inventory-service';

export type ImportRequest = CsvImportRequest;
export type ImportCommitInput = CsvImportCommitInput;
export type { ImportRowError } from '../../shared/csv-import';
import { validateCsvImport, type ParsedImportRow as ParsedRow } from '../../shared/csv-import';
type TokenEntry = { hash: string; request: ImportRequest };

function hashRequest(request: ImportRequest): string {
  return createHash('sha256').update(JSON.stringify({ csv: request.csv, kind: request.kind, locationId: request.locationId ?? '', mapping: request.mapping ?? {} })).digest('hex');
}

export class ImportService {
  private readonly tokens = new Map<string, TokenEntry>();

  constructor(private readonly db: Database.Database, private readonly catalog: CatalogService, private readonly inventory: InventoryService) {}

  preview(request: ImportRequest): ImportPreview {
    const validation = this.validate(request);
    const token = randomUUID();
    const contentHash = hashRequest(request);
    this.tokens.set(token, { hash: contentHash, request });
    const errors = validation.errors;
    const invalidRowNumbers = new Set(validation.errors.filter((error) => error.row > 1).map((error) => error.row));
    for (const entry of validation.rows) if (entry.errors.length) invalidRowNumbers.add(entry.row);
    const validRows = validation.rows.filter((entry) => entry.errors.length === 0 && !invalidRowNumbers.has(entry.row)).length;
    return {
      token, contentHash, kind: request.kind, validRows, invalidRows: invalidRowNumbers.size,
      fileErrors: validation.fileErrors, errors, columns: validation.headers,
      summary: request.kind === 'spreadsheet-aggregate'
        ? 'Imported aggregate stock data. No transaction sales will be created.'
        : `${validRows} valid row${validRows === 1 ? '' : 's'} ready to import.`,
    };
  }

  commit(input: ImportCommitInput): { importedRows: number; aggregate: boolean } {
    const entry = this.tokens.get(input.token);
    const contentHash = hashRequest(input);
    if (!entry || entry.hash !== input.contentHash || contentHash !== input.contentHash) throw new Error('The preview has expired or the CSV content changed. Preview the file again.');
    const validation = this.validate(input);
    if (validation.errors.length) throw new Error('The import contains invalid rows. Correct them and preview again.');
    const apply = () => this.applyValidatedRows(input, validation.rows);
    const result = this.commitCore(apply);
    this.tokens.delete(input.token);
    return { importedRows: result, aggregate: input.kind === 'spreadsheet-aggregate' };
  }

  /** Transaction boundary exposed for Task 8's backup/operation-lock wrapper. */
  commitCore<T>(write: () => T): T {
    return this.db.transaction(write).immediate();
  }

  private validate(request: ImportRequest) {
    return validateCsvImport(request, this.catalog.listProducts(), this.catalog.listProducts({ includeArchived: true }), this.catalog.listLocations(), (name) => createHash('sha256').update(name).digest('hex'));
  }

  private applyValidatedRows(request: ImportRequest, rows: ParsedRow[]): number {
    const locationId = request.locationId;
    let imported = 0;
    const opening: Array<{ productId: string; quantity: number; unit: 'piece' }> = [];
    const replenishment: Array<{ productId: string; quantity: number; unit: 'pack' }> = [];
    for (const row of rows) {
      if (row.product) {
        const { sku, name, piecesPerPack, purchaseCostPerPackCentavos, sellingPricePerPieceCentavos, sellingPricePerPackCentavos, lowStockThresholdPieces } = row.product;
        const product = this.catalog.saveProduct({ sku, name, piecesPerPack, purchaseCostPerPackCentavos, sellingPricePerPieceCentavos, sellingPricePerPackCentavos, lowStockThresholdPieces });
        row.productId = product.id;
      }
      if (row.productId && row.openingPieces !== undefined && locationId) opening.push({ productId: row.productId, quantity: row.openingPieces, unit: 'piece' });
      if (row.productId && row.replenishmentPacks && locationId) replenishment.push({ productId: row.productId, quantity: row.replenishmentPacks, unit: 'pack' });
      imported += 1;
    }
    if (opening.length && locationId) this.inventory.setOpeningStock({ locationId, lines: opening });
    if (replenishment.length && locationId) this.inventory.recordReplenishment({ locationId, note: 'Imported aggregate spreadsheet data', lines: replenishment });
    return imported;
  }
}
