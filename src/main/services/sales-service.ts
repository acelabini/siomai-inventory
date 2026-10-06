import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  completeSaleSchema,
  salesListQuerySchema,
  voidSaleSchema,
  type CompleteSaleInput,
  type SaleLineReceipt,
  type SaleReceipt,
  type SaleSummary,
  type SalesListQuery,
} from '../../shared/schemas';
import { toPieces } from '../domain/quantities';

export type SalesErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'INSUFFICIENT_STOCK' | 'INSUFFICIENT_PAYMENT' | 'PRICE_NOT_SET' | 'ALREADY_VOIDED';

export class SalesError extends Error {
  constructor(readonly code: SalesErrorCode, message: string) {
    super(message);
    this.name = 'SalesError';
  }
}

type ProductRow = { id: string; name: string; pieces_per_pack: number | bigint; purchase_cost_per_pack_centavos: number | bigint; selling_price_per_piece_centavos: number | bigint; selling_price_per_pack_centavos: number | bigint };
type SaleRow = { id: string; location_id: string; business_at: string; total_centavos: number | bigint; payment_centavos: number | bigint; change_centavos: number | bigint; status: 'completed' | 'voided'; note: string | null };
type LineRow = { product_id: string; product_name: string; quantity_pieces: number | bigint; entered_unit: 'piece' | 'pack'; entered_quantity: string; unit_selling_price_centavos: number | bigint; unit_cost_centavos: number | bigint; line_revenue_centavos: number | bigint; line_cost_centavos: number | bigint };

function parseInput<T>(schema: { parse(value: unknown): T }, input: unknown): T {
  try { return schema.parse(input); } catch { throw new SalesError('INVALID_INPUT', 'The sale details are invalid. Check quantities and amounts and try again.'); }
}

function safeNumber(value: number | bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new SalesError('INVALID_INPUT', 'A sale amount or quantity exceeds the safe range.');
  return number;
}

function multiply(a: number, b: number): number {
  const result = BigInt(a) * BigInt(b);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new SalesError('INVALID_INPUT', 'The sale total exceeds the safe range.');
  return Number(result);
}

function packRevenue(quantity: number, priceCentavos: number): number {
  const match = /^([0-9]+)(?:\.([0-9]*))?(?:e([+-]?[0-9]+))?$/i.exec(quantity.toString());
  if (!match) throw new SalesError('INVALID_INPUT', 'Pack quantity must be a valid decimal number.');
  const fraction = match[2] ?? '';
  const exponent = Number(match[3] ?? '0');
  const scale = fraction.length - exponent;
  let numerator = BigInt(`${match[1]}${fraction}`) * BigInt(priceCentavos);
  let denominator = 1n;
  if (scale < 0) numerator *= 10n ** BigInt(-scale);
  else denominator = 10n ** BigInt(scale);
  const rounded = (numerator + denominator / 2n) / denominator;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new SalesError('INVALID_INPUT', 'The sale total exceeds the safe range.');
  return Number(rounded);
}

function proratedCost(packCost: number, packSize: number, pieces: number): number {
  const numerator = BigInt(packCost) * BigInt(pieces);
  const denominator = BigInt(packSize);
  const result = (numerator + denominator / 2n) / denominator;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new SalesError('INVALID_INPUT', 'The sale cost exceeds the safe range.');
  return Number(result);
}

function rowsForSale(db: Database.Database, id: string): LineRow[] {
  return db.prepare(`SELECT l.product_id, p.name AS product_name, l.quantity_pieces, l.entered_unit, l.entered_quantity,
    l.unit_selling_price_centavos, l.unit_cost_centavos, l.line_revenue_centavos, l.line_cost_centavos
    FROM sale_lines l JOIN products p ON p.id = l.product_id WHERE l.sale_id = ? ORDER BY l.rowid`).all(id) as LineRow[];
}

export class SalesService {
  constructor(private readonly db: Database.Database) {}

  completeSale(input: CompleteSaleInput): SaleReceipt {
    const data = parseInput(completeSaleSchema, input);
    const id = randomUUID();
    try {
      this.db.transaction(() => {
        this.requireActiveLocation(data.locationId);
        const grouped = new Map<string, { product: ProductRow; quantityPieces: number; revenue: number; enteredUnit: 'piece' | 'pack'; enteredQuantity: number; sourceLines: number }>();
        let totalCentavos = 0;
        for (const line of data.lines) {
          const product = this.requireActiveProduct(line.productId);
          const packSize = safeNumber(product.pieces_per_pack);
          const quantityPieces = toPieces(line.quantity, line.unit, packSize);
          const piecePrice = safeNumber(product.selling_price_per_piece_centavos);
          const packPrice = safeNumber(product.selling_price_per_pack_centavos);
          const selectedPrice = line.unit === 'pack' ? packPrice : piecePrice;
          if (selectedPrice <= 0) throw new SalesError('PRICE_NOT_SET', `${product.name} has no selling price for ${line.unit}s.`);
          const revenue = line.unit === 'pack' ? packRevenue(line.quantity, selectedPrice) : multiply(quantityPieces, selectedPrice);
          const previous = grouped.get(line.productId);
          if (previous) {
            previous.quantityPieces += quantityPieces;
            previous.revenue += revenue;
            previous.enteredQuantity += line.quantity;
            previous.sourceLines += 1;
            if (!Number.isSafeInteger(previous.quantityPieces) || !Number.isSafeInteger(previous.revenue) || !Number.isSafeInteger(previous.enteredQuantity)) throw new SalesError('INVALID_INPUT', 'The sale total exceeds the safe range.');
          } else {
            grouped.set(line.productId, { product, quantityPieces, revenue, enteredUnit: line.unit, enteredQuantity: line.quantity, sourceLines: 1 });
          }
          totalCentavos += revenue;
          if (!Number.isSafeInteger(totalCentavos)) throw new SalesError('INVALID_INPUT', 'The sale total exceeds the safe range.');
        }
        if (data.paymentCentavos < totalCentavos) throw new SalesError('INSUFFICIENT_PAYMENT', 'Payment must cover the full sale total.');
        const changeCentavos = data.paymentCentavos - totalCentavos;
        this.db.prepare(`INSERT INTO sales (id, location_id, business_at, total_centavos, payment_centavos, change_centavos, note)
          VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)`).run(id, data.locationId, totalCentavos, data.paymentCentavos, changeCentavos, data.note || null);
        for (const item of grouped.values()) {
          const quantityPieces = item.quantityPieces;
          const balance = this.balancePieces(data.locationId, item.product.id);
          if (balance < quantityPieces) throw new SalesError('INSUFFICIENT_STOCK', `Not enough ${item.product.name} is available.`);
          const unitCostCentavos = safeNumber(item.product.purchase_cost_per_pack_centavos);
          const lineCostCentavos = proratedCost(unitCostCentavos, safeNumber(item.product.pieces_per_pack), quantityPieces);
          const unitPrice = item.sourceLines === 1
            ? safeNumber(item.enteredUnit === 'pack' ? item.product.selling_price_per_pack_centavos : item.product.selling_price_per_piece_centavos)
            : Math.floor(item.revenue / quantityPieces);
          this.db.prepare(`INSERT INTO sale_lines
            (id, sale_id, product_id, quantity_pieces, entered_unit, entered_quantity, unit_selling_price_centavos, unit_cost_centavos, line_revenue_centavos, line_cost_centavos)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(randomUUID(), id, item.product.id, quantityPieces, item.sourceLines === 1 ? item.enteredUnit : 'piece', String(item.sourceLines === 1 ? item.enteredQuantity : quantityPieces), unitPrice, unitCostCentavos, item.revenue, lineCostCentavos);
          this.db.prepare(`INSERT INTO stock_movements
            (id, location_id, product_id, quantity_pieces, movement_type, related_entity_type, related_entity_id, note, unit_cost_centavos, line_cost_centavos)
            VALUES (?, ?, ?, ?, 'sale', 'sale', ?, ?, ?, ?)`)
            .run(randomUUID(), data.locationId, item.product.id, -quantityPieces, id, data.note || null, unitCostCentavos, lineCostCentavos);
          this.applyDelta(data.locationId, item.product.id, -quantityPieces);
        }
      }).immediate();
      return this.getReceipt(id);
    } catch (error) { this.rethrow(error); }
  }

  listSales(filter: SalesListQuery = {}): SaleSummary[] {
    const data = parseInput(salesListQuerySchema, filter);
    const clauses: string[] = [];
    const params: (string | number)[] = [];
    if (data?.locationId) { clauses.push('location_id = ?'); params.push(data.locationId); }
    if (data?.status) { clauses.push('status = ?'); params.push(data.status); }
    params.push(data?.limit ?? 200);
    const rows = this.db.prepare(`SELECT id, location_id, business_at, total_centavos, payment_centavos, change_centavos, status, note
      FROM sales ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY business_at DESC, rowid DESC LIMIT ?`).all(...params) as SaleRow[];
    return rows.map((row) => {
      const { lines, ...summary } = this.receiptFromRow(row);
      return { ...summary, lines: lines.map((line) => Object.fromEntries(Object.entries(line).filter(([key]) => key !== 'balancePieces')) as Omit<SaleLineReceipt, 'balancePieces'>) };
    });
  }

  voidSale(saleId: string, reason: string): SaleReceipt {
    const data = parseInput(voidSaleSchema, { saleId, reason });
    try {
      this.db.transaction(() => {
        const sale = this.db.prepare('SELECT id, location_id, status FROM sales WHERE id = ?').get(data.saleId) as { id: string; location_id: string; status: 'completed' | 'voided' } | undefined;
        if (!sale) throw new SalesError('NOT_FOUND', 'The sale could not be found.');
        if (sale.status === 'voided') throw new SalesError('ALREADY_VOIDED', 'This sale has already been voided.');
        const lines = this.db.prepare('SELECT product_id, quantity_pieces FROM sale_lines WHERE sale_id = ?').all(data.saleId) as Array<{ product_id: string; quantity_pieces: number | bigint }>;
        const updated = this.db.prepare("UPDATE sales SET status = 'voided' WHERE id = ? AND status = 'completed'").run(data.saleId);
        if (updated.changes !== 1) throw new SalesError('ALREADY_VOIDED', 'This sale has already been voided.');
        for (const line of lines) {
          const quantityPieces = safeNumber(line.quantity_pieces);
          this.db.prepare(`INSERT INTO stock_movements (id, location_id, product_id, quantity_pieces, movement_type, related_entity_type, related_entity_id, note)
            VALUES (?, ?, ?, ?, 'sale_void', 'sale_void', ?, ?)`)
            .run(randomUUID(), sale.location_id, line.product_id, quantityPieces, data.saleId, data.reason);
          this.applyDelta(sale.location_id, line.product_id, quantityPieces);
        }
      }).immediate();
      return this.getReceipt(data.saleId);
    } catch (error) { this.rethrow(error); }
  }

  private getReceipt(id: string): SaleReceipt {
    const row = this.db.prepare('SELECT id, location_id, business_at, total_centavos, payment_centavos, change_centavos, status, note FROM sales WHERE id = ?').get(id) as SaleRow | undefined;
    if (!row) throw new SalesError('NOT_FOUND', 'The sale could not be found.');
    return this.receiptFromRow(row);
  }

  private receiptFromRow(row: SaleRow): SaleReceipt {
    const lines = rowsForSale(this.db, row.id).map((line) => {
      const balance = this.db.prepare('SELECT quantity_pieces FROM inventory_balances WHERE location_id = ? AND product_id = ?').get(row.location_id, line.product_id) as { quantity_pieces: number | bigint } | undefined;
      return {
        productId: line.product_id, productName: line.product_name, quantityPieces: safeNumber(line.quantity_pieces),
        enteredUnit: line.entered_unit, enteredQuantity: line.entered_quantity,
        unitSellingPriceCentavos: safeNumber(line.unit_selling_price_centavos), unitCostCentavos: safeNumber(line.unit_cost_centavos),
        lineRevenueCentavos: safeNumber(line.line_revenue_centavos), lineCostCentavos: safeNumber(line.line_cost_centavos), balancePieces: balance ? safeNumber(balance.quantity_pieces) : 0,
      } satisfies SaleLineReceipt;
    });
    return { id: row.id, locationId: row.location_id, businessAt: row.business_at, totalCentavos: safeNumber(row.total_centavos), paymentCentavos: safeNumber(row.payment_centavos), changeCentavos: safeNumber(row.change_centavos), status: row.status, note: row.note, lines };
  }

  private requireActiveLocation(id: string): void {
    if (!this.db.prepare('SELECT id FROM locations WHERE id = ? AND is_active = 1').get(id)) throw new SalesError('NOT_FOUND', 'The location is no longer active.');
  }

  private requireActiveProduct(id: string): ProductRow {
    const row = this.db.prepare(`SELECT id, name, pieces_per_pack, purchase_cost_per_pack_centavos, selling_price_per_piece_centavos, selling_price_per_pack_centavos
      FROM products WHERE id = ? AND is_active = 1`).get(id) as ProductRow | undefined;
    if (!row) throw new SalesError('NOT_FOUND', 'The product is no longer active.');
    return row;
  }

  private balancePieces(locationId: string, productId: string): number {
    const row = this.db.prepare('SELECT quantity_pieces FROM inventory_balances WHERE location_id = ? AND product_id = ?').get(locationId, productId) as { quantity_pieces: number | bigint } | undefined;
    return row ? safeNumber(row.quantity_pieces) : 0;
  }

  private applyDelta(locationId: string, productId: string, delta: number): void {
    const balance = this.balancePieces(locationId, productId) + delta;
    if (!Number.isSafeInteger(balance) || balance < 0) throw new SalesError(delta < 0 ? 'INSUFFICIENT_STOCK' : 'INVALID_INPUT', 'The stock balance cannot be negative or exceed the safe range.');
    this.db.prepare(`INSERT INTO inventory_balances (location_id, product_id, quantity_pieces) VALUES (?, ?, ?)
      ON CONFLICT(location_id, product_id) DO UPDATE SET quantity_pieces = excluded.quantity_pieces, updated_at = CURRENT_TIMESTAMP`).run(locationId, productId, balance);
  }

  private rethrow(error: unknown): never {
    if (error instanceof SalesError) throw error;
    if (error instanceof RangeError) throw new SalesError('INVALID_INPUT', 'Quantity must convert to a whole piece.');
    throw new SalesError('INVALID_INPUT', 'The sale could not be completed. Check the details and try again.');
  }
}
