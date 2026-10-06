import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  movementHistoryQuerySchema,
  replenishmentSchema,
  setOpeningStockSchema,
  stockCountSchema,
  transferSchema,
  type InventoryBalance,
  type InventoryReceipt,
  type MovementHistoryQuery,
  type ReplenishmentInput,
  type SetOpeningStockInput,
  type StockCountInput,
  type StockCountReceipt,
  type StockMovement,
  type TransferInput,
  type TransferReceipt,
} from '../../shared/schemas';
import { toPieces } from '../domain/quantities';

export type InventoryErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'INSUFFICIENT_STOCK' | 'SAME_LOCATION' | 'DISCREPANCY_REASON_REQUIRED' | 'OPENING_STOCK_ALREADY_SET';

export class InventoryError extends Error {
  constructor(readonly code: InventoryErrorCode, message: string) {
    super(message);
    this.name = 'InventoryError';
  }
}

type ProductRow = { id: string; pieces_per_pack: number | bigint; purchase_cost_per_pack_centavos: number | bigint; is_active: number | bigint };
type BalanceRow = { location_id: string; product_id: string; quantity_pieces: number | bigint };
type MovementRow = Omit<StockMovement, 'quantityPieces' | 'unitCostCentavos' | 'lineCostCentavos'> & {
  quantityPieces: number | bigint; unitCostCentavos: number | bigint | null; lineCostCentavos: number | bigint | null;
};

function parseInput<T>(schema: { parse(value: unknown): T }, input: unknown): T {
  try { return schema.parse(input); } catch { throw new InventoryError('INVALID_INPUT', 'The stock details are invalid. Check quantities and try again.'); }
}

function safeNumber(value: number | bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new InventoryError('INVALID_INPUT', 'The stock quantity exceeds the safe range.');
  return number;
}

function roundedPieceCost(packCost: number, packSize: number, pieces: number): number {
  const numerator = BigInt(packCost) * BigInt(pieces);
  const denominator = BigInt(packSize);
  const result = (numerator + denominator / 2n) / denominator;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new InventoryError('INVALID_INPUT', 'The replenishment cost exceeds the safe range.');
  return Number(result);
}

function uniqueProducts(lines: readonly { productId: string }[]): void {
  if (new Set(lines.map((line) => line.productId)).size !== lines.length) {
    throw new InventoryError('INVALID_INPUT', 'Each product can appear only once in a stock operation.');
  }
}

export class InventoryService {
  constructor(private readonly db: Database.Database) {}

  setOpeningStock(input: SetOpeningStockInput): InventoryReceipt {
    const data = parseInput(setOpeningStockSchema, input);
    uniqueProducts(data.lines);
    const id = randomUUID();
    try {
      const lines = this.db.transaction(() => {
        this.requireActiveLocation(data.locationId);
        const result = [] as InventoryReceipt['lines'];
        for (const line of data.lines) {
          const product = this.requireActiveProduct(line.productId);
          const quantityPieces = line.quantity === 0 ? 0 : toPieces(line.quantity, line.unit, safeNumber(product.pieces_per_pack));
          const current = this.balancePieces(data.locationId, line.productId);
          const movementCount = Number((this.db.prepare('SELECT COUNT(*) AS count FROM stock_movements WHERE location_id = ? AND product_id = ?').get(data.locationId, line.productId) as { count: number | bigint }).count);
          const openingExists = this.db.prepare('SELECT 1 FROM opening_stock_records WHERE location_id = ? AND product_id = ?').get(data.locationId, line.productId);
          if (current !== 0 || movementCount !== 0 || openingExists) throw new InventoryError('OPENING_STOCK_ALREADY_SET', 'Opening stock has already been recorded for this product at this location.');
          this.db.prepare('INSERT INTO opening_stock_records (location_id, product_id, quantity_pieces) VALUES (?, ?, ?)').run(data.locationId, line.productId, quantityPieces);
          if (quantityPieces > 0) {
            this.writeMovement({ id: randomUUID(), locationId: data.locationId, productId: line.productId, quantityPieces, movementType: 'opening_balance', relatedType: 'opening_stock', relatedId: id, note: 'Opening stock' });
            this.applyDelta(data.locationId, line.productId, quantityPieces);
          }
          result.push({ productId: line.productId, quantityPieces, balancePieces: quantityPieces });
        }
        return result;
      }).immediate();
      return { id, lines };
    } catch (error) { this.rethrow(error); }
  }

  recordReplenishment(input: ReplenishmentInput): InventoryReceipt {
    const data = parseInput(replenishmentSchema, input);
    uniqueProducts(data.lines);
    const id = randomUUID();
    try {
      const lines = this.db.transaction(() => {
        this.requireActiveLocation(data.locationId);
        this.db.prepare('INSERT INTO replenishments (id, location_id, note) VALUES (?, ?, ?)').run(id, data.locationId, data.note || null);
        const receipt = [] as InventoryReceipt['lines'];
        for (const line of data.lines) {
          const product = this.requireActiveProduct(line.productId);
          const packSize = safeNumber(product.pieces_per_pack);
          const quantityPieces = toPieces(line.quantity, line.unit, packSize);
          const unitCostCentavos = safeNumber(product.purchase_cost_per_pack_centavos);
          const lineCostCentavos = roundedPieceCost(unitCostCentavos, packSize, quantityPieces);
          const lineId = randomUUID();
          this.db.prepare(`INSERT INTO replenishment_lines
            (id, replenishment_id, product_id, quantity_pieces, entered_unit, entered_quantity, unit_cost_centavos, line_cost_centavos)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(lineId, id, line.productId, quantityPieces, line.unit, String(line.quantity), unitCostCentavos, lineCostCentavos);
          this.writeMovement({ id: randomUUID(), locationId: data.locationId, productId: line.productId, quantityPieces, movementType: 'replenishment', relatedType: 'replenishment', relatedId: id, note: data.note || null, unitCostCentavos, lineCostCentavos });
          const balancePieces = this.applyDelta(data.locationId, line.productId, quantityPieces);
          receipt.push({ productId: line.productId, quantityPieces, balancePieces, unitCostCentavos, lineCostCentavos });
        }
        return receipt;
      }).immediate();
      return { id, lines };
    } catch (error) { this.rethrow(error); }
  }

  transferStock(input: TransferInput): TransferReceipt {
    const data = parseInput(transferSchema, input);
    uniqueProducts(data.lines);
    if (data.fromLocationId === data.toLocationId) throw new InventoryError('SAME_LOCATION', 'Choose a different destination location.');
    const id = randomUUID();
    try {
      const lines = this.db.transaction(() => {
        this.requireActiveLocation(data.fromLocationId);
        this.requireActiveLocation(data.toLocationId);
        this.db.prepare('INSERT INTO transfer_batches (id, from_location_id, to_location_id, note) VALUES (?, ?, ?, ?)').run(id, data.fromLocationId, data.toLocationId, data.note || null);
        const receipt: TransferReceipt['lines'] = [];
        for (const line of data.lines) {
          const product = this.requireActiveProduct(line.productId);
          const quantityPieces = toPieces(line.quantity, line.unit, safeNumber(product.pieces_per_pack));
          const available = this.balancePieces(data.fromLocationId, line.productId);
          if (available < quantityPieces) throw new InventoryError('INSUFFICIENT_STOCK', `Not enough ${line.productId} at the source location.`);
          const transferLineId = randomUUID();
          this.db.prepare('INSERT INTO transfers (id, from_location_id, to_location_id, product_id, quantity_pieces, note, transfer_batch_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(transferLineId, data.fromLocationId, data.toLocationId, line.productId, quantityPieces, data.note || null, id);
          this.writeMovement({ id: randomUUID(), locationId: data.fromLocationId, productId: line.productId, quantityPieces: -quantityPieces, movementType: 'transfer_out', relatedType: 'transfer', relatedId: id, note: data.note || null });
          this.writeMovement({ id: randomUUID(), locationId: data.toLocationId, productId: line.productId, quantityPieces, movementType: 'transfer_in', relatedType: 'transfer', relatedId: id, note: data.note || null });
          const fromBalancePieces = this.applyDelta(data.fromLocationId, line.productId, -quantityPieces);
          const toBalancePieces = this.applyDelta(data.toLocationId, line.productId, quantityPieces);
          receipt.push({ productId: line.productId, quantityPieces, fromBalancePieces, toBalancePieces });
        }
        return receipt;
      }).immediate();
      return { id, lines };
    } catch (error) { this.rethrow(error); }
  }

  submitStockCount(input: StockCountInput): StockCountReceipt {
    const data = parseInput(stockCountSchema, input);
    uniqueProducts(data.lines);
    const id = randomUUID();
    try {
      const lines = this.db.transaction(() => {
        this.requireActiveLocation(data.locationId);
        this.db.prepare('INSERT INTO stock_counts (id, location_id, note) VALUES (?, ?, ?)').run(id, data.locationId, data.note || null);
        const receipt: StockCountReceipt['lines'] = [];
        for (const line of data.lines) {
          const product = this.requireActiveProduct(line.productId);
          const countedPieces = line.countedQuantity === 0 ? 0 : toPieces(line.countedQuantity, line.unit, safeNumber(product.pieces_per_pack));
          const expectedPieces = this.balancePieces(data.locationId, line.productId);
          const differencePieces = countedPieces - expectedPieces;
          const reason = line.reason?.trim() || null;
          if (differencePieces !== 0 && !reason) throw new InventoryError('DISCREPANCY_REASON_REQUIRED', 'Enter a reason for each stock-count difference.');
          this.db.prepare('INSERT INTO stock_count_lines (id, stock_count_id, product_id, expected_pieces, counted_pieces, note) VALUES (?, ?, ?, ?, ?, ?)')
            .run(randomUUID(), id, line.productId, expectedPieces, countedPieces, reason);
          if (differencePieces !== 0) {
            this.writeMovement({ id: randomUUID(), locationId: data.locationId, productId: line.productId, quantityPieces: differencePieces, movementType: 'count_adjustment', relatedType: 'stock_count', relatedId: id, note: reason });
            this.applyDelta(data.locationId, line.productId, differencePieces);
          }
          receipt.push({ productId: line.productId, expectedPieces, countedPieces, differencePieces, balancePieces: countedPieces });
        }
        return receipt;
      }).immediate();
      return { id, lines };
    } catch (error) { this.rethrow(error); }
  }

  getBalances(locationId: string): InventoryBalance[] {
    const rows = this.db.prepare('SELECT location_id, product_id, quantity_pieces FROM inventory_balances WHERE location_id = ? AND quantity_pieces <> 0 ORDER BY product_id').all(locationId) as BalanceRow[];
    return rows.map((row) => ({ locationId: row.location_id, productId: row.product_id, quantityPieces: safeNumber(row.quantity_pieces) }));
  }

  getMovementHistory(query: MovementHistoryQuery = {}): StockMovement[] {
    const data = parseInput(movementHistoryQuerySchema, query);
    const clauses: string[] = [];
    const params: (string | number)[] = [];
    if (data.locationId) { clauses.push('m.location_id = ?'); params.push(data.locationId); }
    if (data.productId) { clauses.push('m.product_id = ?'); params.push(data.productId); }
    if (data.movementType) { clauses.push('m.movement_type = ?'); params.push(data.movementType); }
    params.push(data.limit ?? 200);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`SELECT m.id, m.location_id AS locationId, m.product_id AS productId, p.name AS productName,
      m.quantity_pieces AS quantityPieces, m.movement_type AS movementType, m.occurred_at AS occurredAt,
      m.related_entity_type AS relatedEntityType, m.related_entity_id AS relatedEntityId, m.note,
      m.unit_cost_centavos AS unitCostCentavos, m.line_cost_centavos AS lineCostCentavos
      FROM stock_movements m JOIN products p ON p.id = m.product_id ${where} ORDER BY m.occurred_at DESC, m.rowid DESC LIMIT ?`).all(...params) as MovementRow[];
    return rows.map((row) => ({ ...row, quantityPieces: safeNumber(row.quantityPieces), unitCostCentavos: row.unitCostCentavos === null ? null : safeNumber(row.unitCostCentavos), lineCostCentavos: row.lineCostCentavos === null ? null : safeNumber(row.lineCostCentavos) }));
  }

  getLedgerBalance(locationId: string, productId: string): number {
    const row = this.db.prepare('SELECT COALESCE(SUM(quantity_pieces), 0) AS total FROM stock_movements WHERE location_id = ? AND product_id = ?').get(locationId, productId) as { total: number | bigint };
    return safeNumber(row.total);
  }

  private requireActiveLocation(id: string): void {
    const row = this.db.prepare('SELECT id FROM locations WHERE id = ? AND is_active = 1').get(id);
    if (!row) throw new InventoryError('NOT_FOUND', 'The location is no longer active.');
  }

  private requireActiveProduct(id: string): ProductRow {
    const row = this.db.prepare('SELECT id, pieces_per_pack, purchase_cost_per_pack_centavos, is_active FROM products WHERE id = ? AND is_active = 1').get(id) as ProductRow | undefined;
    if (!row) throw new InventoryError('NOT_FOUND', 'The product is no longer active.');
    return row;
  }

  private balancePieces(locationId: string, productId: string): number {
    const row = this.db.prepare('SELECT quantity_pieces FROM inventory_balances WHERE location_id = ? AND product_id = ?').get(locationId, productId) as { quantity_pieces: number | bigint } | undefined;
    return row ? safeNumber(row.quantity_pieces) : 0;
  }

  private applyDelta(locationId: string, productId: string, delta: number): number {
    const balance = this.balancePieces(locationId, productId) + delta;
    if (!Number.isSafeInteger(balance) || balance < 0) throw new InventoryError('INSUFFICIENT_STOCK', 'The stock balance cannot be negative or exceed the safe range.');
    this.db.prepare(`INSERT INTO inventory_balances (location_id, product_id, quantity_pieces) VALUES (?, ?, ?)
      ON CONFLICT(location_id, product_id) DO UPDATE SET quantity_pieces = excluded.quantity_pieces, updated_at = CURRENT_TIMESTAMP`).run(locationId, productId, balance);
    return balance;
  }

  private writeMovement(input: { id: string; locationId: string; productId: string; quantityPieces: number; movementType: string; relatedType: string; relatedId: string; note: string | null; unitCostCentavos?: number; lineCostCentavos?: number }): void {
    this.db.prepare(`INSERT INTO stock_movements (id, location_id, product_id, quantity_pieces, movement_type, related_entity_type,
      related_entity_id, note, unit_cost_centavos, line_cost_centavos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(input.id, input.locationId, input.productId, input.quantityPieces, input.movementType, input.relatedType, input.relatedId, input.note, input.unitCostCentavos ?? null, input.lineCostCentavos ?? null);
  }

  private rethrow(error: unknown): never {
    if (error instanceof InventoryError) throw error;
    if (error instanceof RangeError) throw new InventoryError('INVALID_INPUT', 'Quantity must convert to a whole piece.');
    throw new InventoryError('INVALID_INPUT', 'The stock change could not be saved. Check the details and try again.');
  }
}
