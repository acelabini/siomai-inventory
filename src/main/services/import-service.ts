import type Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import type { CatalogProduct, CsvImportCommitInput, CsvImportRequest, ImportKind, ImportPreview } from '../../shared/schemas';
import { CatalogService } from './catalog-service';
import { InventoryService } from './inventory-service';

export type ImportRequest = CsvImportRequest;
export type ImportCommitInput = CsvImportCommitInput;
export type ImportRowError = { row: number; message: string };
type Row = { row: number; values: Record<string, string> };
type ParsedRow = { row: number; product?: CatalogProduct; productId?: string; openingPieces?: number; replenishmentPacks?: number; errors: string[] };
type TokenEntry = { hash: string; request: ImportRequest };

const aliases: Record<ImportKind, Record<string, string[]>> = {
  products: {
    sku: ['sku'], name: ['name', 'product name'], piecesPerPack: ['pieces per pack', 'piecesperpack'],
    purchaseCostPerPack: ['purchase cost (php)', 'purchase cost per pack (php)', 'cost per pack'],
    sellingPricePerPiece: ['piece price (php)', 'selling price per piece (php)', 'selling price per piece'],
    sellingPricePerPack: ['pack price (php)', 'selling price per pack (php)', 'selling price per pack'],
    openingPacks: ['opening packs', 'pack quantity'],
  },
  'opening-stock': { sku: ['sku'], name: ['name', 'product', 'product name'], quantity: ['quantity'], unit: ['unit'] },
  'spreadsheet-aggregate': {
    name: ['product name', 'product'], piecesPerPack: ['pieces per pack'], packQuantity: ['pack quantity'],
    replenishmentQuantity: ['replenishment quantity'], pieces: ['pieces'], totalCost: ['total cost'],
  },
};

function normalizeHeader(value: string): string { return value.trim().toLocaleLowerCase().replaceAll('_', ' ').replaceAll(/\s+/g, ' '); }

function parseCsv(csv: string): { headers: string[]; rows: Row[]; errors: ImportRowError[] } {
  const text = csv.replace(/^\uFEFF/, '');
  const table: string[][] = [];
  let row: string[] = [], field = '', quoted = false, afterQuote = false;
  const parseErrors: ImportRowError[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') { quoted = false; afterQuote = true; }
      else field += char;
      continue;
    }
    if (char === '"' && field === '' && !afterQuote) { quoted = true; continue; }
    if (char === ',') { row.push(field); field = ''; afterQuote = false; continue; }
    if (char === '\r' || char === '\n') {
      row.push(field); field = ''; afterQuote = false;
      if (row.some((cell) => cell.trim() !== '')) table.push(row);
      row = [];
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      continue;
    }
    if (afterQuote && char.trim() !== '') parseErrors.push({ row: table.length + 1, message: 'Unexpected text after a quoted field.' });
    field += char;
  }
  if (quoted) parseErrors.push({ row: table.length + 1, message: 'A quoted field is not closed.' });
  if (field.length > 0 || row.length > 0) { row.push(field); if (row.some((cell) => cell.trim() !== '')) table.push(row); }
  const headers = (table.shift() ?? []).map((header) => header.trim());
  if (!headers.length) return { headers, rows: [], errors: [{ row: 1, message: 'The CSV file has no header row.' }, ...parseErrors] };
  const normalized = headers.map(normalizeHeader);
  for (const [index, header] of normalized.entries()) {
    if (normalized.indexOf(header) !== index) parseErrors.push({ row: 1, message: `Duplicate column "${headers[index]}".` });
  }
  const rows = table.map((cells, index) => ({
    row: index + 2,
    values: Object.fromEntries(headers.map((header, column) => [header, cells[column] ?? ''])),
  }));
  return { headers, rows, errors: parseErrors };
}

function phpCentavos(value: string): number | null {
  const raw = value.trim().replace(/^₱\s*/, '').replaceAll(',', '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole = '', fraction = ''] = raw.split('.');
  const amount = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(amount) ? amount : null;
}

function numeric(value: string, integer = true): number | null {
  if (!value.trim()) return null;
  const number = Number(value.trim());
  return Number.isFinite(number) && number >= 0 && number <= Number.MAX_SAFE_INTEGER && (!integer || Number.isSafeInteger(number)) ? number : null;
}

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
    const validRows = validation.rows.filter((entry) => entry.errors.length === 0).length;
    return {
      token, contentHash, kind: request.kind, validRows, invalidRows: validation.rows.length - validRows,
      errors, columns: validation.headers,
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

  private validate(request: ImportRequest): { headers: string[]; rows: ParsedRow[]; errors: ImportRowError[] } {
    const parsed = parseCsv(request.csv);
    const errors = [...parsed.errors];
    const getColumn = (key: string) => {
      const explicit = request.mapping?.[key];
      if (explicit && parsed.headers.includes(explicit)) return explicit;
      const normalized = parsed.headers.find((header) => aliases[request.kind][key]?.includes(normalizeHeader(header)));
      return normalized;
    };
    const required = request.kind === 'products'
      ? ['sku', 'name', 'piecesPerPack', 'purchaseCostPerPack', 'sellingPricePerPiece', 'sellingPricePerPack']
      : request.kind === 'opening-stock' ? ['name', 'quantity', 'unit']
        : ['name', 'piecesPerPack', 'packQuantity', 'replenishmentQuantity', 'pieces', 'totalCost'];
    for (const key of required) if (!getColumn(key)) errors.push({ row: 1, message: `Required column is missing: ${key}.` });
    const openingPacksColumn = getColumn('openingPacks');
    const includesOpeningPacks = request.kind === 'products' && !!openingPacksColumn
      && parsed.rows.some(({ values }) => !!values[openingPacksColumn]?.trim());
    if ((request.kind !== 'products' || includesOpeningPacks)
      && (!request.locationId || !this.catalog.listLocations().some((location) => location.id === request.locationId))) {
      errors.push({ row: 1, message: 'Choose an active location for this import.' });
    }
    const products = this.catalog.listProducts();
    const allProducts = this.catalog.listProducts({ includeArchived: true });
    const rows: ParsedRow[] = parsed.rows.map(({ row, values }) => {
      const raw = (key: string) => { const header = getColumn(key); return header ? values[header]?.trim() ?? '' : ''; };
      const result: ParsedRow = { row, errors: [] };
      if (request.kind === 'products') {
        const sku = raw('sku'), name = raw('name'), piecesPerPack = numeric(raw('piecesPerPack'));
        const purchaseCost = phpCentavos(raw('purchaseCostPerPack'));
        const sellingPiece = phpCentavos(raw('sellingPricePerPiece'));
        const sellingPack = phpCentavos(raw('sellingPricePerPack'));
        if (!sku || !name) result.errors.push('SKU and product name are required.');
        if (allProducts.some((product) => product.sku.toLowerCase() === sku.toLowerCase())) result.errors.push(`Duplicate SKU "${sku}".`);
        if (piecesPerPack === null || piecesPerPack < 1) result.errors.push('Pieces per pack must be a positive whole number.');
        if (purchaseCost === null || sellingPiece === null || sellingPack === null) result.errors.push('Enter valid PHP amounts with up to two decimal places.');
        const duplicateName = products.filter((product) => product.name.toLocaleLowerCase() === name.toLocaleLowerCase()).length;
        if (duplicateName > 0) result.errors.push(`Product name "${name}" is ambiguous; map it to an existing product or use a corrected name.`);
        if (sku && name && piecesPerPack !== null && piecesPerPack > 0 && purchaseCost !== null && sellingPiece !== null && sellingPack !== null) {
          result.product = { id: '', sku, name, piecesPerPack, purchaseCostPerPackCentavos: purchaseCost, sellingPricePerPieceCentavos: sellingPiece, sellingPricePerPackCentavos: sellingPack, lowStockThresholdPieces: 0, isActive: true };
          const packsRaw = raw('openingPacks');
          if (packsRaw) {
            const packs = numeric(packsRaw, false);
            if (packs === null || !Number.isSafeInteger(packs * piecesPerPack)) result.errors.push('Opening packs must convert to a whole number of pieces.');
            else result.openingPieces = packs * piecesPerPack;
          }
        }
      } else if (request.kind === 'opening-stock') {
        const sku = raw('sku'), name = raw('name');
        const quantity = numeric(raw('quantity'), false), unit = raw('unit').toLowerCase();
        const matches = products.filter((product) => sku ? product.sku.toLowerCase() === sku.toLowerCase() : product.name.toLocaleLowerCase() === name.toLocaleLowerCase());
        if (!sku && !name) result.errors.push('Enter a product SKU or name.');
        if (matches.length !== 1) result.errors.push(matches.length > 1 ? `Product name "${name}" is ambiguous; map the SKU or choose a product explicitly.` : `Product "${sku || name}" was not found.`);
        if (quantity === null || !['piece', 'pieces', 'pack', 'packs'].includes(unit)) result.errors.push('Enter a valid quantity and unit (piece or pack).');
        if (matches.length === 1 && quantity !== null && ['piece', 'pieces', 'pack', 'packs'].includes(unit)) {
          const pieces = quantity * (unit.startsWith('pack') ? matches[0]!.piecesPerPack : 1);
          if (!Number.isSafeInteger(pieces)) result.errors.push('Quantity does not convert to a whole safe number of pieces.');
          else { result.productId = matches[0]!.id; result.openingPieces = pieces; }
        }
      } else {
        const name = raw('name');
        const packSize = numeric(raw('piecesPerPack'));
        const packs = numeric(raw('packQuantity'), false);
        const replenishment = numeric(raw('replenishmentQuantity'), false);
        const pieces = numeric(raw('pieces'));
        const totalCost = phpCentavos(raw('totalCost'));
        if (!name) result.errors.push('Product name is required.');
        if (packSize === null || packSize < 1) result.errors.push('Pieces per pack must be a positive whole number.');
        if (packs === null || replenishment === null || pieces === null || totalCost === null) result.errors.push('Enter valid pack, piece, and total cost values.');
        const matches = products.filter((product) => product.name.toLocaleLowerCase() === name.toLocaleLowerCase());
        if (matches.length > 1) result.errors.push(`Product name "${name}" is ambiguous; provide a unique product name.`);
        if (matches.length === 1 && packSize !== null && matches[0]!.piecesPerPack !== packSize) result.errors.push(`Pieces per pack for "${name}" does not match the catalog.`);
        if (packSize !== null && packs !== null && replenishment !== null && pieces !== null) {
          const openingPieces = packs * packSize + pieces;
          if (!Number.isSafeInteger(openingPieces) || !Number.isSafeInteger(replenishment * packSize)) result.errors.push('Stock values must convert to whole safe pieces.');
          else result.openingPieces = openingPieces;
        }
        if (matches.length === 1) result.productId = matches[0]!.id;
        if (!matches.length && name && packSize !== null && packSize > 0 && totalCost !== null) {
          result.product = { id: '', sku: `IMPORT-${createHash('sha256').update(name.toLocaleLowerCase()).digest('hex').slice(0, 12).toUpperCase()}`, name, piecesPerPack: packSize, purchaseCostPerPackCentavos: totalCost, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0, lowStockThresholdPieces: 0, isActive: true };
        }
        if (replenishment !== null) result.replenishmentPacks = replenishment;
      }
      if (result.errors.length) errors.push(...result.errors.map((message) => ({ row, message })));
      return result;
    });
    const seenSkus = new Set<string>();
    for (const entry of rows) if (entry.product && request.kind === 'products') {
      const sku = entry.product.sku.toLowerCase();
      if (seenSkus.has(sku)) errors.push({ row: entry.row, message: `Duplicate SKU "${entry.product.sku}" in this file.` });
      seenSkus.add(sku);
    }
    return { headers: parsed.headers, rows, errors };
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
