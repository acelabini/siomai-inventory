import type { Table } from 'dexie';
import type { InventoryApi } from '../shared/contracts';
import {
  balancesQuerySchema, movementHistoryQuerySchema, replenishmentSchema, setOpeningStockSchema,
  stockCountSchema, transferSchema, type InventoryBalance, type InventoryReceipt,
  type MovementHistoryQuery, type ReplenishmentInput, type SetOpeningStockInput,
  type StockCountInput, type StockCountReceipt, type StockMovement, type TransferInput,
  type TransferReceipt,
} from '../shared/schemas';
import { toPieces } from '../shared/quantities';
import type { BrowserDatabase } from './db';
import type { ProductRecord, StockMovementRecord } from './records';

type InventoryErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'INSUFFICIENT_STOCK' | 'SAME_LOCATION'
  | 'DISCREPANCY_REASON_REQUIRED' | 'OPENING_STOCK_ALREADY_SET';

export class BrowserInventoryError extends Error {
  constructor(readonly code: InventoryErrorCode, message: string) {
    super(message);
    this.name = 'InventoryError';
  }
}

function parseInput<T>(schema: { parse(input: unknown): T }, input: unknown): T {
  try { return schema.parse(input); } catch {
    throw new BrowserInventoryError('INVALID_INPUT', 'The stock details are invalid. Check quantities and try again.');
  }
}

function uniqueProducts(lines: readonly { productId: string }[]): void {
  if (new Set(lines.map((line) => line.productId)).size !== lines.length) {
    throw new BrowserInventoryError('INVALID_INPUT', 'Each product can appear only once in a stock operation.');
  }
}

function roundedPieceCost(packCost: number, packSize: number, pieces: number): number {
  if (!Number.isSafeInteger(packCost) || packCost < 0) {
    throw new BrowserInventoryError('INVALID_INPUT', 'The replenishment cost exceeds the safe range.');
  }
  const denominator = BigInt(packSize);
  const cost = (BigInt(packCost) * BigInt(pieces) + denominator / 2n) / denominator;
  if (cost > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new BrowserInventoryError('INVALID_INPUT', 'The replenishment cost exceeds the safe range.');
  }
  return Number(cost);
}

export class BrowserInventoryService implements Pick<InventoryApi,
  'setOpeningStock' | 'recordReplenishment' | 'transferStock' | 'submitStockCount' | 'getBalances' | 'getMovementHistory'> {
  constructor(private readonly db: BrowserDatabase) {}

  async setOpeningStock(input: SetOpeningStockInput): Promise<InventoryReceipt> {
    const data = parseInput(setOpeningStockSchema, input);
    uniqueProducts(data.lines);
    return this.mutate([this.db.openingStockRecords], async () => {
      await this.requireActiveLocation(data.locationId);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const lines: InventoryReceipt['lines'] = [];
      for (const line of data.lines) {
        const product = await this.requireActiveProduct(line.productId);
        const quantityPieces = line.quantity === 0 ? 0 : toPieces(line.quantity, line.unit, product.piecesPerPack);
        const key: [string, string] = [data.locationId, line.productId];
        const current = await this.balancePieces(...key);
        const movement = await this.db.stockMovements.where('[locationId+productId]').equals(key).first();
        if (current !== 0 || movement || await this.db.openingStockRecords.get(key)) {
          throw new BrowserInventoryError('OPENING_STOCK_ALREADY_SET', 'Opening stock has already been recorded for this product at this location.');
        }
        await this.db.openingStockRecords.add({ locationId: data.locationId, productId: line.productId, quantityPieces, recordedAt: now });
        if (quantityPieces > 0) {
          await this.writeMovement({ locationId: data.locationId, productId: line.productId, quantityPieces,
            movementType: 'opening_balance', relatedEntityType: 'opening_stock', relatedEntityId: id,
            note: 'Opening stock' }, now);
        }
        const balancePieces = await this.applyDelta(data.locationId, line.productId, quantityPieces, now);
        lines.push({ productId: line.productId, quantityPieces, balancePieces });
      }
      return { id, lines };
    });
  }

  async recordReplenishment(input: ReplenishmentInput): Promise<InventoryReceipt> {
    const data = parseInput(replenishmentSchema, input);
    uniqueProducts(data.lines);
    return this.mutate([this.db.replenishments, this.db.replenishmentLines], async () => {
      await this.requireActiveLocation(data.locationId);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const note = data.note || null;
      await this.db.replenishments.add({ id, locationId: data.locationId, occurredAt: now, createdAt: now, note });
      const lines: InventoryReceipt['lines'] = [];
      for (const line of data.lines) {
        const product = await this.requireActiveProduct(line.productId);
        const quantityPieces = toPieces(line.quantity, line.unit, product.piecesPerPack);
        const unitCostCentavos = product.purchaseCostPerPackCentavos;
        const lineCostCentavos = roundedPieceCost(unitCostCentavos, product.piecesPerPack, quantityPieces);
        await this.db.replenishmentLines.add({ id: crypto.randomUUID(), replenishmentId: id,
          productId: line.productId, quantityPieces, enteredUnit: line.unit, enteredQuantity: String(line.quantity),
          unitCostCentavos, lineCostCentavos });
        await this.writeMovement({ locationId: data.locationId, productId: line.productId, quantityPieces,
          movementType: 'replenishment', relatedEntityType: 'replenishment', relatedEntityId: id,
          note, unitCostCentavos, lineCostCentavos }, now);
        const balancePieces = await this.applyDelta(data.locationId, line.productId, quantityPieces, now);
        lines.push({ productId: line.productId, quantityPieces, balancePieces, unitCostCentavos, lineCostCentavos });
      }
      return { id, lines };
    });
  }

  async transferStock(input: TransferInput): Promise<TransferReceipt> {
    const data = parseInput(transferSchema, input);
    uniqueProducts(data.lines);
    if (data.fromLocationId === data.toLocationId) {
      throw new BrowserInventoryError('SAME_LOCATION', 'Choose a different destination location.');
    }
    return this.mutate([this.db.transferBatches, this.db.transfers], async () => {
      await this.requireActiveLocation(data.fromLocationId);
      await this.requireActiveLocation(data.toLocationId);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const note = data.note || null;
      await this.db.transferBatches.add({ id, fromLocationId: data.fromLocationId, toLocationId: data.toLocationId, note, createdAt: now });
      const lines: TransferReceipt['lines'] = [];
      for (const line of data.lines) {
        const product = await this.requireActiveProduct(line.productId);
        const quantityPieces = toPieces(line.quantity, line.unit, product.piecesPerPack);
        if (await this.balancePieces(data.fromLocationId, line.productId) < quantityPieces) {
          throw new BrowserInventoryError('INSUFFICIENT_STOCK', `Not enough ${line.productId} at the source location.`);
        }
        await this.db.transfers.add({ id: crypto.randomUUID(), transferBatchId: id,
          fromLocationId: data.fromLocationId, toLocationId: data.toLocationId, productId: line.productId,
          quantityPieces, occurredAt: now, createdAt: now, note });
        await this.writeMovement({ locationId: data.fromLocationId, productId: line.productId, quantityPieces: -quantityPieces,
          movementType: 'transfer_out', relatedEntityType: 'transfer', relatedEntityId: id, note }, now);
        await this.writeMovement({ locationId: data.toLocationId, productId: line.productId, quantityPieces,
          movementType: 'transfer_in', relatedEntityType: 'transfer', relatedEntityId: id, note }, now);
        const fromBalancePieces = await this.applyDelta(data.fromLocationId, line.productId, -quantityPieces, now);
        const toBalancePieces = await this.applyDelta(data.toLocationId, line.productId, quantityPieces, now);
        lines.push({ productId: line.productId, quantityPieces, fromBalancePieces, toBalancePieces });
      }
      return { id, lines };
    });
  }

  async submitStockCount(input: StockCountInput): Promise<StockCountReceipt> {
    const data = parseInput(stockCountSchema, input);
    uniqueProducts(data.lines);
    return this.mutate([this.db.stockCounts, this.db.stockCountLines], async () => {
      await this.requireActiveLocation(data.locationId);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await this.db.stockCounts.add({ id, locationId: data.locationId, countedAt: now, createdAt: now, note: data.note || null });
      const lines: StockCountReceipt['lines'] = [];
      for (const line of data.lines) {
        const product = await this.requireActiveProduct(line.productId);
        const countedPieces = line.countedQuantity === 0 ? 0 : toPieces(line.countedQuantity, line.unit, product.piecesPerPack);
        const expectedPieces = await this.balancePieces(data.locationId, line.productId);
        const differencePieces = countedPieces - expectedPieces;
        const reason = line.reason || null;
        if (differencePieces !== 0 && !reason) {
          throw new BrowserInventoryError('DISCREPANCY_REASON_REQUIRED', 'Enter a reason for each stock-count difference.');
        }
        await this.db.stockCountLines.add({ id: crypto.randomUUID(), stockCountId: id, productId: line.productId,
          expectedPieces, countedPieces, note: reason });
        if (differencePieces !== 0) {
          await this.writeMovement({ locationId: data.locationId, productId: line.productId,
            quantityPieces: differencePieces, movementType: 'count_adjustment', relatedEntityType: 'stock_count',
            relatedEntityId: id, note: reason }, now);
          await this.applyDelta(data.locationId, line.productId, differencePieces, now);
        }
        lines.push({ productId: line.productId, expectedPieces, countedPieces, differencePieces, balancePieces: countedPieces });
      }
      return { id, lines };
    });
  }

  async getBalances(locationId: string): Promise<InventoryBalance[]> {
    const data = parseInput(balancesQuerySchema, { locationId });
    const records = await this.db.inventoryBalances.where('locationId').equals(data.locationId).toArray();
    return records.filter((record) => record.quantityPieces !== 0)
      .sort((a, b) => a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0)
      .map(({ locationId, productId, quantityPieces }) => ({ locationId, productId, quantityPieces }));
  }

  async getMovementHistory(query: MovementHistoryQuery = {}): Promise<StockMovement[]> {
    const data = parseInput(movementHistoryQuerySchema, query);
    return this.db.transaction('r', this.db.stockMovements, this.db.products, async () => {
      // IndexedDB orders equal index values by primary key, so reverse also breaks timestamp ties by ID descending.
      const records = await this.db.stockMovements.orderBy('occurredAt').reverse().filter((record) =>
        (!data.locationId || record.locationId === data.locationId)
        && (!data.productId || record.productId === data.productId)
        && (!data.movementType || record.movementType === data.movementType))
        .limit(data.limit ?? 200).toArray();
      const products = new Map((await this.db.products.bulkGet(records.map((record) => record.productId)))
        .filter((product): product is ProductRecord => product !== undefined).map((product) => [product.id, product]));
      return records.map((record) => ({
        id: record.id, locationId: record.locationId, productId: record.productId,
        productName: products.get(record.productId)?.name ?? record.productId,
        quantityPieces: record.quantityPieces, movementType: record.movementType,
        occurredAt: record.occurredAt, relatedEntityType: record.relatedEntityType,
        relatedEntityId: record.relatedEntityId, note: record.note,
        unitCostCentavos: record.unitCostCentavos, lineCostCentavos: record.lineCostCentavos,
      }));
    });
  }

  private async mutate<T>(tables: Table[], action: () => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction('rw', [this.db.locations, this.db.products, this.db.inventoryBalances,
        this.db.stockMovements, ...tables], action);
    } catch (error) {
      if (error instanceof BrowserInventoryError) throw error;
      if (error instanceof RangeError) throw new BrowserInventoryError('INVALID_INPUT', 'Quantity must convert to a whole piece.');
      throw new BrowserInventoryError('INVALID_INPUT', 'The stock change could not be saved. Check the details and try again.');
    }
  }

  private async requireActiveLocation(id: string): Promise<void> {
    if (!(await this.db.locations.get(id))?.isActive) {
      throw new BrowserInventoryError('NOT_FOUND', 'The location is no longer active.');
    }
  }

  private async requireActiveProduct(id: string): Promise<ProductRecord> {
    const product = await this.db.products.get(id);
    if (!product?.isActive) throw new BrowserInventoryError('NOT_FOUND', 'The product is no longer active.');
    return product;
  }

  private async balancePieces(locationId: string, productId: string): Promise<number> {
    return (await this.db.inventoryBalances.get([locationId, productId]))?.quantityPieces ?? 0;
  }

  private async applyDelta(locationId: string, productId: string, delta: number, now: string): Promise<number> {
    const quantityPieces = await this.balancePieces(locationId, productId) + delta;
    if (!Number.isSafeInteger(quantityPieces) || quantityPieces < 0) {
      throw new BrowserInventoryError('INSUFFICIENT_STOCK', 'The stock balance cannot be negative or exceed the safe range.');
    }
    await this.db.inventoryBalances.put({ locationId, productId, quantityPieces, updatedAt: now });
    return quantityPieces;
  }

  private async writeMovement(input: Omit<StockMovementRecord, 'id' | 'occurredAt' | 'createdAt' | 'unitCostCentavos' | 'lineCostCentavos'>
    & Partial<Pick<StockMovementRecord, 'unitCostCentavos' | 'lineCostCentavos'>>, now: string): Promise<void> {
    await this.db.stockMovements.add({ ...input, id: crypto.randomUUID(), occurredAt: now, createdAt: now,
      unitCostCentavos: input.unitCostCentavos ?? null, lineCostCentavos: input.lineCostCentavos ?? null });
  }
}
