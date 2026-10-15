import { z } from 'zod';
import { catalogLocationSchema, catalogProductSchema } from '../shared/schemas';
import type { BrowserDatabase } from './db';

const id = z.string().min(1);
const integer = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const amount = integer.nonnegative();
const positive = amount.positive();
const timestamp = z.string().refine((value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, 'Expected an ISO timestamp');
const note = z.string().max(500).nullable();
const entity = { id, createdAt: timestamp };
const pair = { locationId: id, productId: id };
const entered = { enteredUnit: z.enum(['piece', 'pack']), enteredQuantity: z.string().refine((value) => /^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value) && Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= Number.MAX_SAFE_INTEGER) };
const costs = { unitCostCentavos: amount, lineCostCentavos: amount };
const transfer = { fromLocationId: id, toLocationId: id };
const schemas = {
  settings: z.strictObject({ key: id, value: z.string() }),
  locations: catalogLocationSchema.extend({ createdAt: timestamp, updatedAt: timestamp }).strict(),
  products: catalogProductSchema.extend({ createdAt: timestamp, updatedAt: timestamp }).strict(),
  inventoryBalances: z.strictObject({ ...pair, quantityPieces: amount, updatedAt: timestamp }),
  openingStockRecords: z.strictObject({ ...pair, quantityPieces: amount, recordedAt: timestamp }),
  stockMovements: z.strictObject({ ...entity, ...pair, quantityPieces: integer,
    movementType: z.enum(['opening_balance', 'replenishment', 'transfer_in', 'transfer_out', 'count_adjustment', 'sale', 'sale_void']),
    occurredAt: timestamp, relatedEntityType: z.enum(['opening_stock', 'replenishment', 'transfer', 'stock_count', 'sale', 'sale_void']).nullable(),
    relatedEntityId: id.nullable(), note, unitCostCentavos: amount.nullable(), lineCostCentavos: amount.nullable() }),
  replenishments: z.strictObject({ ...entity, locationId: id, occurredAt: timestamp, note }),
  replenishmentLines: z.strictObject({ id, replenishmentId: id, productId: id, quantityPieces: positive, ...entered, ...costs }),
  transferBatches: z.strictObject({ ...entity, ...transfer, note }),
  transfers: z.strictObject({ ...entity, ...transfer, transferBatchId: id.nullable(), productId: id, quantityPieces: positive, occurredAt: timestamp, note }),
  stockCounts: z.strictObject({ ...entity, locationId: id, countedAt: timestamp, note }),
  stockCountLines: z.strictObject({ id, stockCountId: id, productId: id, expectedPieces: amount, countedPieces: amount, note }),
  sales: z.strictObject({ ...entity, locationId: id, businessAt: timestamp, totalCentavos: amount, paymentCentavos: amount, changeCentavos: amount, note, status: z.enum(['completed', 'voided']) }),
  saleLines: z.strictObject({ id, saleId: id, lineIndex: amount, productId: id, quantityPieces: positive, ...entered, ...costs, unitSellingPriceCentavos: amount, lineRevenueCentavos: amount }),
};
export type BrowserTableName = keyof typeof schemas;
export const browserTableNames = Object.keys(schemas) as BrowserTableName[];
type Tables = { [K in BrowserTableName]: z.infer<(typeof schemas)[K]>[] };
export type BrowserBackup = { format: 'siomai-inventory-web-backup'; version: 1; createdAt: string; tables: Tables };
const tablesSchema = z.strictObject({
  settings: schemas.settings.array(), locations: schemas.locations.array(), products: schemas.products.array(),
  inventoryBalances: schemas.inventoryBalances.array(), openingStockRecords: schemas.openingStockRecords.array(),
  stockMovements: schemas.stockMovements.array(), replenishments: schemas.replenishments.array(), replenishmentLines: schemas.replenishmentLines.array(),
  transferBatches: schemas.transferBatches.array(), transfers: schemas.transfers.array(), stockCounts: schemas.stockCounts.array(),
  stockCountLines: schemas.stockCountLines.array(), sales: schemas.sales.array(), saleLines: schemas.saleLines.array(),
});
const envelope = z.strictObject({ format: z.literal('siomai-inventory-web-backup'), version: z.literal(1), createdAt: timestamp, tables: tablesSchema });

function requireBackup(condition: unknown): asserts condition {
  if (!condition) throw new Error('The backup contains inconsistent or missing ledger records.');
}
function unique<T>(rows: T[], key: (row: T) => string): void {
  requireBackup(new Set(rows.map(key)).size === rows.length);
}
const pairKey = (row: { locationId: string; productId: string }) => JSON.stringify([row.locationId, row.productId]);

export function validateBrowserBackup(input: unknown): BrowserBackup {
  const parsed = envelope.safeParse(input);
  if (!parsed.success) throw new Error('This backup is invalid or is not compatible with this version.');
  const backup = parsed.data;
  const t = backup.tables;
  for (const name of browserTableNames) {
    const rows = t[name];
    unique(rows as Array<Record<string, unknown>>, (row) => name === 'settings' ? String(row.key)
      : name === 'inventoryBalances' || name === 'openingStockRecords' ? JSON.stringify([row.locationId, row.productId]) : String(row.id));
  }
  unique(t.locations, (row) => row.name);
  unique(t.products, (row) => row.sku);
  unique(t.replenishmentLines, (row) => JSON.stringify([row.replenishmentId, row.productId]));
  unique(t.stockCountLines, (row) => JSON.stringify([row.stockCountId, row.productId]));
  const locations = new Set(t.locations.map((row) => row.id));
  const products = new Set(t.products.map((row) => row.id));
  const replenishments = new Map(t.replenishments.map((row) => [row.id, row]));
  const batches = new Map(t.transferBatches.map((row) => [row.id, row]));
  const transfers = new Map(t.transfers.map((row) => [row.id, row]));
  const counts = new Map(t.stockCounts.map((row) => [row.id, row]));
  const sales = new Map(t.sales.map((row) => [row.id, row]));
  for (const row of [...t.inventoryBalances, ...t.openingStockRecords, ...t.stockMovements]) requireBackup(locations.has(row.locationId) && products.has(row.productId));
  for (const row of [...t.replenishments, ...t.stockCounts, ...t.sales]) requireBackup(locations.has(row.locationId));
  for (const row of [...t.transferBatches, ...t.transfers]) requireBackup(locations.has(row.fromLocationId) && locations.has(row.toLocationId) && row.fromLocationId !== row.toLocationId);
  for (const row of t.replenishmentLines) requireBackup(replenishments.has(row.replenishmentId) && products.has(row.productId));
  for (const row of t.stockCountLines) requireBackup(counts.has(row.stockCountId) && products.has(row.productId));
  for (const row of t.saleLines) requireBackup(sales.has(row.saleId) && products.has(row.productId));
  for (const row of t.transfers) {
    requireBackup(products.has(row.productId));
    if (row.transferBatchId !== null) {
      const batch = batches.get(row.transferBatchId);
      requireBackup(batch && batch.fromLocationId === row.fromLocationId && batch.toLocationId === row.toLocationId);
    }
  }
  for (const sale of t.sales) {
    const lines = t.saleLines.filter((row) => row.saleId === sale.id).sort((a, b) => a.lineIndex - b.lineIndex);
    requireBackup(lines.length > 0 && lines.every((row, index) => row.lineIndex === index));
    requireBackup(lines.reduce((total, row) => total + BigInt(row.lineRevenueCentavos), 0n) === BigInt(sale.totalCentavos));
    requireBackup(BigInt(sale.paymentCentavos) - BigInt(sale.totalCentavos) === BigInt(sale.changeCentavos));
  }
  for (const row of t.replenishments) requireBackup(t.replenishmentLines.some((line) => line.replenishmentId === row.id));
  for (const row of t.stockCounts) requireBackup(t.stockCountLines.some((line) => line.stockCountId === row.id));
  for (const row of t.transferBatches) requireBackup(t.transfers.some((line) => line.transferBatchId === row.id));
  const opening = new Set(t.openingStockRecords.map(pairKey));
  for (const movement of t.stockMovements) {
    const ref = movement.relatedEntityId;
    const type = movement.relatedEntityType;
    if (movement.movementType === 'opening_balance') {
      requireBackup(opening.has(pairKey(movement)) && (type === null && ref === null || type === 'opening_stock' && ref !== null));
    } else {
      requireBackup(type !== null && ref !== null);
      if (type === 'replenishment') requireBackup(movement.movementType === 'replenishment' && replenishments.get(ref)?.locationId === movement.locationId && t.replenishmentLines.some((line) => line.replenishmentId === ref && line.productId === movement.productId));
      else if (type === 'stock_count') requireBackup(movement.movementType === 'count_adjustment' && counts.get(ref)?.locationId === movement.locationId && t.stockCountLines.some((line) => line.stockCountId === ref && line.productId === movement.productId));
      else if (type === 'sale' || type === 'sale_void') requireBackup(movement.movementType === type && sales.get(ref)?.locationId === movement.locationId && (type !== 'sale_void' || sales.get(ref)?.status === 'voided') && t.saleLines.some((line) => line.saleId === ref && line.productId === movement.productId));
      else if (type === 'transfer') {
        const batch = batches.get(ref);
        const transferRows = batch ? t.transfers.filter((row) => row.transferBatchId === ref) : transfers.has(ref) ? [transfers.get(ref)!] : [];
        requireBackup(transferRows.some((row) => row.productId === movement.productId && (movement.movementType === 'transfer_in' && row.toLocationId === movement.locationId || movement.movementType === 'transfer_out' && row.fromLocationId === movement.locationId)));
      } else requireBackup(false);
    }
    if (['opening_balance', 'replenishment', 'transfer_in', 'sale_void'].includes(movement.movementType)) requireBackup(movement.quantityPieces > 0);
    if (['sale', 'transfer_out'].includes(movement.movementType)) requireBackup(movement.quantityPieces < 0);
    if (movement.movementType === 'count_adjustment') requireBackup(movement.quantityPieces !== 0);
  }
  const settings = new Map(t.settings.map((row) => [row.key, row.value]));
  const balances = new Map(t.inventoryBalances.map((row) => [pairKey(row), BigInt(row.quantityPieces)]));
  const movementTotals = new Map<string, bigint>();
  for (const row of t.stockMovements) {
    const key = pairKey(row);
    requireBackup(balances.has(key));
    movementTotals.set(key, (movementTotals.get(key) ?? 0n) + BigInt(row.quantityPieces));
  }
  for (const [key, quantity] of balances) requireBackup(quantity === (movementTotals.get(key) ?? 0n));
  requireBackup(!settings.has('setup_complete') || ['true', 'false'].includes(settings.get('setup_complete')!));
  if (settings.get('setup_complete') === 'true') requireBackup(settings.get('business_name')?.trim() && t.locations.some((row) => row.isActive));
  return backup;
}

export async function snapshotBrowserBackup(db: BrowserDatabase, now: Date): Promise<BrowserBackup> {
  return db.transaction('r', db.tables, async () => ({ format: 'siomai-inventory-web-backup', version: 1, createdAt: now.toISOString(),
    tables: Object.fromEntries(await Promise.all(browserTableNames.map(async (name) => [name, await db.table(name).toArray()]))) as Tables }));
}
