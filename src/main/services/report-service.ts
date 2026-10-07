import type Database from 'better-sqlite3';
import { reportFilterSchema, type ReportFilter, type StockMovement } from '../../shared/schemas';
import type { DashboardReport, DiscrepancyReport, LowStockReport, MovementReport, ProfitReport, SalesReport, ValuationReport } from '../../shared/contracts';

type Range = { date: string; start: string; end: string; locationId?: string };
type NumberValue = number | bigint;

function safeNumber(value: NumberValue): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error('Report amount exceeds the safe integer range.');
  return result;
}

function proratedCost(quantityPieces: number, packCostCentavos: number, piecesPerPack: number): number {
  const numerator = BigInt(quantityPieces) * BigInt(packCostCentavos);
  const result = (numerator + BigInt(piecesPerPack) / 2n) / BigInt(piecesPerPack);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Report amount exceeds the safe integer range.');
  return Number(result);
}

function todayInManila(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function reportRange(input: ReportFilter = {}): Range {
  const data = reportFilterSchema.parse(input);
  const date = data.date ?? todayInManila();
  const [year, month, day] = date.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000);
  const end = new Date(start.valueOf() + 24 * 60 * 60 * 1000);
  const sqlTime = (value: Date) => value.toISOString().slice(0, 19).replace('T', ' ');
  return { date, start: sqlTime(start), end: sqlTime(end), ...(data.locationId ? { locationId: data.locationId } : {}) };
}

function locationClause(range: Range, column: string): { sql: string; params: string[] } {
  return range.locationId ? { sql: ` AND ${column} = ?`, params: [range.locationId] } : { sql: '', params: [] };
}

export class ReportService {
  constructor(private readonly db: Database.Database) {}

  getDashboard(filter: ReportFilter = {}): DashboardReport {
    const range = reportRange(filter);
    const profit = this.getProfitReport(filter);
    const discrepancy = this.getDiscrepancyReport(filter);
    const location = locationClause(range, 'm.location_id');
    const productRows = this.db.prepare(`SELECT p.id AS product_id, p.sku, p.name AS product_name, p.pieces_per_pack,
      p.purchase_cost_per_pack_centavos, p.low_stock_threshold_pieces,
      COALESCE(SUM(CASE WHEN m.occurred_at < ? THEN m.quantity_pieces ELSE 0 END), 0) AS opening_pieces,
      COALESCE(SUM(CASE WHEN m.occurred_at >= ? AND m.occurred_at < ? AND m.movement_type IN ('replenishment', 'transfer_in') THEN m.quantity_pieces ELSE 0 END), 0) AS replenished_pieces,
      COALESCE(SUM(CASE WHEN m.occurred_at >= ? AND m.occurred_at < ? AND m.movement_type = 'sale' AND s.status = 'completed' THEN -m.quantity_pieces ELSE 0 END), 0) AS sold_pieces,
      COALESCE(SUM(CASE WHEN m.occurred_at < ? THEN m.quantity_pieces ELSE 0 END), 0) +
      COALESCE(SUM(CASE WHEN m.occurred_at >= ? AND m.occurred_at < ? THEN m.quantity_pieces ELSE 0 END), 0) AS remaining_pieces
      FROM products p
      LEFT JOIN stock_movements m ON m.product_id = p.id ${location.sql} AND m.occurred_at < ?
      LEFT JOIN sales s ON s.id = m.related_entity_id AND m.movement_type = 'sale'
      GROUP BY p.id ORDER BY p.name COLLATE NOCASE`).all(
      range.start, range.start, range.end, range.start, range.end, range.start, range.start, range.end,
      ...location.params, range.end,
    ) as Array<{ product_id: string; sku: string; product_name: string; pieces_per_pack: NumberValue; purchase_cost_per_pack_centavos: NumberValue; low_stock_threshold_pieces: NumberValue; opening_pieces: NumberValue; replenished_pieces: NumberValue; sold_pieces: NumberValue; remaining_pieces: NumberValue }>;
    const products = productRows.map((row) => {
      const piecesPerPack = safeNumber(row.pieces_per_pack);
      const quantityPieces = safeNumber(row.remaining_pieces);
      const unitCost = safeNumber(row.purchase_cost_per_pack_centavos);
      const stockValueCentavos = proratedCost(quantityPieces, unitCost, piecesPerPack);
      const lowStockThresholdPieces = safeNumber(row.low_stock_threshold_pieces);
      return {
        productId: row.product_id, sku: row.sku, productName: row.product_name, piecesPerPack,
        openingPieces: safeNumber(row.opening_pieces), replenishedPieces: safeNumber(row.replenished_pieces),
        soldPieces: safeNumber(row.sold_pieces), remainingPieces: quantityPieces, stockValueCentavos,
        lowStockThresholdPieces, isLowStock: quantityPieces <= lowStockThresholdPieces,
      };
    });
    return {
      locationId: range.locationId ?? null, date: range.date,
      metrics: {
        revenueCentavos: profit.revenueCentavos, costCentavos: profit.costCentavos,
        grossProfitCentavos: profit.grossProfitCentavos, stockValueCentavos: products.reduce((sum, row) => sum + row.stockValueCentavos, 0),
        discrepancyCount: discrepancy.count, lowStockCount: products.filter((row) => row.isLowStock).length,
      },
      products,
    };
  }

  getSalesReport(filter: ReportFilter = {}): SalesReport {
    const range = reportRange(filter);
    const location = locationClause(range, 's.location_id');
    const rows = this.db.prepare(`SELECT s.id, s.location_id, s.business_at,
      COALESCE(SUM(l.line_revenue_centavos), 0) AS revenue_centavos,
      COALESCE(SUM(l.line_cost_centavos), 0) AS cost_centavos
      FROM sales s JOIN sale_lines l ON l.sale_id = s.id
      WHERE s.status = 'completed' AND s.business_at >= ? AND s.business_at < ?${location.sql}
      GROUP BY s.id ORDER BY s.business_at DESC, s.rowid DESC`).all(range.start, range.end, ...location.params) as Array<{ id: string; location_id: string; business_at: string; revenue_centavos: NumberValue; cost_centavos: NumberValue }>;
    return { date: range.date, sales: rows.map((row) => {
      const totalCentavos = safeNumber(row.revenue_centavos);
      const costCentavos = safeNumber(row.cost_centavos);
      return { id: row.id, locationId: row.location_id, businessAt: row.business_at, totalCentavos, costCentavos, grossProfitCentavos: totalCentavos - costCentavos, status: 'completed' };
    }) };
  }

  getMovementReport(filter: ReportFilter = {}): MovementReport {
    const range = reportRange(filter);
    const location = locationClause(range, 'm.location_id');
    const rows = this.db.prepare(`SELECT m.id, m.location_id AS locationId, m.product_id AS productId, p.name AS productName,
      m.quantity_pieces AS quantityPieces, m.movement_type AS movementType, m.occurred_at AS occurredAt,
      m.related_entity_type AS relatedEntityType, m.related_entity_id AS relatedEntityId, m.note,
      m.unit_cost_centavos AS unitCostCentavos, m.line_cost_centavos AS lineCostCentavos
      FROM stock_movements m JOIN products p ON p.id = m.product_id
      WHERE m.occurred_at >= ? AND m.occurred_at < ?${location.sql}
      ORDER BY m.occurred_at, m.rowid`).all(range.start, range.end, ...location.params) as Array<Omit<StockMovement, 'quantityPieces' | 'unitCostCentavos' | 'lineCostCentavos'> & { quantityPieces: NumberValue; unitCostCentavos: NumberValue | null; lineCostCentavos: NumberValue | null }>;
    return { date: range.date, movements: rows.map((row) => ({
      ...row, quantityPieces: safeNumber(row.quantityPieces),
      unitCostCentavos: row.unitCostCentavos === null ? null : safeNumber(row.unitCostCentavos),
      lineCostCentavos: row.lineCostCentavos === null ? null : safeNumber(row.lineCostCentavos),
    })) };
  }

  // Historical quantities use the ledger, while valuation uses the current catalog cost because no historical opening cost is stored.
  getValuationReport(filter: ReportFilter = {}): ValuationReport {
    const range = reportRange(filter);
    const location = locationClause(range, 'm.location_id');
    const rows = this.db.prepare(`SELECT m.location_id, m.product_id, p.name AS product_name, SUM(m.quantity_pieces) AS quantity_pieces,
      p.pieces_per_pack, p.purchase_cost_per_pack_centavos
      FROM stock_movements m JOIN products p ON p.id = m.product_id
      WHERE m.occurred_at < ?${location.sql} GROUP BY m.location_id, m.product_id HAVING SUM(m.quantity_pieces) > 0
      ORDER BY m.location_id, p.name COLLATE NOCASE`).all(range.end, ...location.params) as Array<{ location_id: string; product_id: string; product_name: string; quantity_pieces: NumberValue; pieces_per_pack: NumberValue; purchase_cost_per_pack_centavos: NumberValue }>;
    const items = rows.map((row) => ({ locationId: row.location_id, productId: row.product_id, productName: row.product_name, quantityPieces: safeNumber(row.quantity_pieces), valueCentavos: proratedCost(safeNumber(row.quantity_pieces), safeNumber(row.purchase_cost_per_pack_centavos), safeNumber(row.pieces_per_pack)) }));
    return { date: range.date, totalValueCentavos: items.reduce((sum, item) => sum + item.valueCentavos, 0), items };
  }

  getProfitReport(filter: ReportFilter = {}): ProfitReport {
    const range = reportRange(filter);
    const location = locationClause(range, 's.location_id');
    const row = this.db.prepare(`SELECT COALESCE(SUM(l.line_revenue_centavos), 0) AS revenue_centavos,
      COALESCE(SUM(l.line_cost_centavos), 0) AS cost_centavos FROM sale_lines l JOIN sales s ON s.id = l.sale_id
      WHERE s.status = 'completed' AND s.business_at >= ? AND s.business_at < ?${location.sql}`)
      .get(range.start, range.end, ...location.params) as { revenue_centavos: NumberValue; cost_centavos: NumberValue };
    const revenueCentavos = safeNumber(row.revenue_centavos);
    const costCentavos = safeNumber(row.cost_centavos);
    return { date: range.date, revenueCentavos, costCentavos, grossProfitCentavos: revenueCentavos - costCentavos };
  }

  getDiscrepancyReport(filter: ReportFilter = {}): DiscrepancyReport {
    const range = reportRange(filter);
    const location = locationClause(range, 'c.location_id');
    const rows = this.db.prepare(`SELECT c.location_id, l.product_id, p.name AS product_name,
      l.expected_pieces, l.counted_pieces, l.counted_pieces - l.expected_pieces AS difference_pieces, c.counted_at
      FROM stock_counts c JOIN stock_count_lines l ON l.stock_count_id = c.id JOIN products p ON p.id = l.product_id
      WHERE c.counted_at >= ? AND c.counted_at < ? AND l.expected_pieces <> l.counted_pieces${location.sql}
      ORDER BY c.counted_at DESC, p.name COLLATE NOCASE`).all(range.start, range.end, ...location.params) as Array<{ location_id: string; product_id: string; product_name: string; expected_pieces: NumberValue; counted_pieces: NumberValue; difference_pieces: NumberValue; counted_at: string }>;
    return { date: range.date, count: rows.length, items: rows.map((row) => ({ locationId: row.location_id, productId: row.product_id, productName: row.product_name, expectedPieces: safeNumber(row.expected_pieces), countedPieces: safeNumber(row.counted_pieces), differencePieces: safeNumber(row.difference_pieces), countedAt: row.counted_at })) };
  }

  getLowStockReport(filter: ReportFilter = {}): LowStockReport {
    const range = reportRange(filter);
    const location = locationClause(range, 'l.id');
    const rows = this.db.prepare(`SELECT l.id AS location_id, p.id AS product_id, p.name AS product_name,
      COALESCE(SUM(m.quantity_pieces), 0) AS quantity_pieces, p.low_stock_threshold_pieces
      FROM locations l CROSS JOIN products p LEFT JOIN stock_movements m ON m.location_id = l.id AND m.product_id = p.id AND m.occurred_at < ?
      WHERE l.is_active = 1 AND p.is_active = 1${location.sql}
      GROUP BY l.id, p.id HAVING COALESCE(SUM(m.quantity_pieces), 0) <= p.low_stock_threshold_pieces
      ORDER BY l.name COLLATE NOCASE, p.name COLLATE NOCASE`).all(range.end, ...location.params) as Array<{ location_id: string; product_id: string; product_name: string; quantity_pieces: NumberValue; low_stock_threshold_pieces: NumberValue }>;
    return { date: range.date, count: rows.length, items: rows.map((row) => ({ locationId: row.location_id, productId: row.product_id, productName: row.product_name, quantityPieces: safeNumber(row.quantity_pieces), lowStockThresholdPieces: safeNumber(row.low_stock_threshold_pieces) })) };
  }
}
