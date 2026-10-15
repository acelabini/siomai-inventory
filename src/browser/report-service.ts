import type {
  InventoryApi, DashboardReport, DiscrepancyReport, LowStockReport, MovementReport,
  ProfitReport, SalesReport, ValuationReport,
} from '../shared/contracts';
import { reportFilterSchema, type ReportFilter } from '../shared/schemas';
import type { BrowserDatabase } from './db';
import type { LocationRecord, ProductRecord, SaleLineRecord, SaleRecord, StockCountLineRecord, StockCountRecord, StockMovementRecord } from './records';
import { manilaBusinessDate, manilaDayRange } from './time';

type Range = { date: string; start: string; end: string; locationId?: string };
type Snapshot = {
  products: ProductRecord[]; locations: LocationRecord[]; movements: StockMovementRecord[];
  sales: SaleRecord[]; saleLines: SaleLineRecord[]; counts: StockCountRecord[]; countLines: StockCountLineRecord[];
};
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const nameOrder = (a: { name: string }, b: { name: string }) => compare(a.name.toLowerCase(), b.name.toLowerCase());
const inDay = (time: string, range: Range) => time >= range.start && time < range.end;
const atLocation = (locationId: string, range: Range) => !range.locationId || locationId === range.locationId;

function safe(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error('Report amount exceeds the safe integer range.');
  return result;
}
const sum = (values: number[]) => safe(values.reduce((total, value) => total + BigInt(value), 0n));
function cost(pieces: number, product: ProductRecord): number {
  const denominator = BigInt(product.piecesPerPack);
  return safe((BigInt(pieces) * BigInt(product.purchaseCostPerPackCentavos) + denominator / 2n) / denominator);
}

export class BrowserReportService implements Pick<InventoryApi,
  'getDashboard' | 'getSalesReport' | 'getMovementReport' | 'getValuationReport' | 'getProfitReport' | 'getDiscrepancyReport' | 'getLowStockReport'> {
  constructor(private readonly db: BrowserDatabase) {}

  async getDashboard(filter: ReportFilter = {}): Promise<DashboardReport> {
    return this.read(filter, (snapshot, range) => {
      const profit = this.profit(snapshot, range);
      const discrepancy = this.discrepancies(snapshot, range);
      const sales = new Map(snapshot.sales.map((sale) => [sale.id, sale]));
      const products = [...snapshot.products].sort(nameOrder).map((product) => {
        const movements = snapshot.movements.filter((movement) => movement.productId === product.id && atLocation(movement.locationId, range) && movement.occurredAt < range.end);
        const openingPieces = sum(movements.filter((movement) => movement.occurredAt < range.start).map((movement) => movement.quantityPieces));
        const today = movements.filter((movement) => inDay(movement.occurredAt, range));
        const remainingPieces = sum(movements.map((movement) => movement.quantityPieces));
        return { productId: product.id, sku: product.sku, productName: product.name, piecesPerPack: product.piecesPerPack,
          openingPieces, replenishedPieces: sum(today.filter((movement) => movement.movementType === 'replenishment' || movement.movementType === 'transfer_in').map((movement) => movement.quantityPieces)),
          soldPieces: sum(today.filter((movement) => movement.movementType === 'sale' && sales.get(movement.relatedEntityId ?? '')?.status === 'completed').map((movement) => -movement.quantityPieces)),
          remainingPieces, stockValueCentavos: cost(remainingPieces, product), lowStockThresholdPieces: product.lowStockThresholdPieces,
          isLowStock: remainingPieces <= product.lowStockThresholdPieces };
      });
      return { date: range.date, locationId: range.locationId ?? null, products,
        metrics: { revenueCentavos: profit.revenueCentavos, costCentavos: profit.costCentavos, grossProfitCentavos: profit.grossProfitCentavos,
          stockValueCentavos: sum(products.map((product) => product.stockValueCentavos)), discrepancyCount: discrepancy.count,
          lowStockCount: products.filter((product) => product.isLowStock).length } };
    });
  }

  async getSalesReport(filter: ReportFilter = {}): Promise<SalesReport> {
    return this.read(filter, (snapshot, range) => this.sales(snapshot, range));
  }

  async getProfitReport(filter: ReportFilter = {}): Promise<ProfitReport> {
    return this.read(filter, (snapshot, range) => this.profit(snapshot, range));
  }

  async getMovementReport(filter: ReportFilter = {}): Promise<MovementReport> {
    return this.read(filter, (snapshot, range) => ({ date: range.date,
      movements: snapshot.movements.filter((movement) => inDay(movement.occurredAt, range) && atLocation(movement.locationId, range))
        .sort((a, b) => compare(b.occurredAt, a.occurredAt) || compare(b.id, a.id))
        .map((movement) => ({ id: movement.id, locationId: movement.locationId, productId: movement.productId,
          productName: snapshot.products.find((product) => product.id === movement.productId)?.name ?? movement.productId,
          quantityPieces: movement.quantityPieces, movementType: movement.movementType, occurredAt: movement.occurredAt,
          relatedEntityType: movement.relatedEntityType, relatedEntityId: movement.relatedEntityId,
          note: movement.note, unitCostCentavos: movement.unitCostCentavos, lineCostCentavos: movement.lineCostCentavos })),
    }));
  }

  async getValuationReport(filter: ReportFilter = {}): Promise<ValuationReport> {
    return this.read(filter, (snapshot, range) => {
      const groups = new Map<string, { locationId: string; productId: string; quantities: number[] }>();
      for (const movement of snapshot.movements) {
        if (movement.occurredAt >= range.end || !atLocation(movement.locationId, range)) continue;
        const key = JSON.stringify([movement.locationId, movement.productId]);
        const group = groups.get(key) ?? { locationId: movement.locationId, productId: movement.productId, quantities: [] };
        group.quantities.push(movement.quantityPieces);
        groups.set(key, group);
      }
      const items = [...groups.values()].flatMap((group) => {
        const product = snapshot.products.find((product) => product.id === group.productId);
        const quantityPieces = sum(group.quantities);
        return !product || quantityPieces <= 0 ? [] : [{ locationId: group.locationId, productId: product.id,
          productName: product.name, quantityPieces, valueCentavos: cost(quantityPieces, product) }];
      }).sort((a, b) => compare(a.locationId, b.locationId) || compare(a.productName.toLowerCase(), b.productName.toLowerCase()));
      return { date: range.date, items, totalValueCentavos: sum(items.map((item) => item.valueCentavos)) };
    });
  }

  async getDiscrepancyReport(filter: ReportFilter = {}): Promise<DiscrepancyReport> {
    return this.read(filter, (snapshot, range) => this.discrepancies(snapshot, range));
  }

  async getLowStockReport(filter: ReportFilter = {}): Promise<LowStockReport> {
    return this.read(filter, (snapshot, range) => {
      const items: LowStockReport['items'] = [];
      for (const location of snapshot.locations.filter((location) => location.isActive && atLocation(location.id, range)).sort(nameOrder)) {
        for (const product of snapshot.products.filter((product) => product.isActive).sort(nameOrder)) {
          const quantityPieces = sum(snapshot.movements.filter((movement) => movement.locationId === location.id && movement.productId === product.id && movement.occurredAt < range.end).map((movement) => movement.quantityPieces));
          if (quantityPieces <= product.lowStockThresholdPieces) items.push({ locationId: location.id, productId: product.id,
            productName: product.name, quantityPieces, lowStockThresholdPieces: product.lowStockThresholdPieces });
        }
      }
      return { date: range.date, count: items.length, items };
    });
  }

  private sales(snapshot: Snapshot, range: Range): SalesReport {
    const sales = snapshot.sales.filter((sale) => sale.status === 'completed' && inDay(sale.businessAt, range) && atLocation(sale.locationId, range))
      .sort((a, b) => compare(b.businessAt, a.businessAt) || compare(b.id, a.id))
      .flatMap((sale) => {
        const lines = snapshot.saleLines.filter((line) => line.saleId === sale.id);
        if (!lines.length) return [];
        const totalCentavos = sum(lines.map((line) => line.lineRevenueCentavos));
        const costCentavos = sum(lines.map((line) => line.lineCostCentavos));
        return [{ id: sale.id, locationId: sale.locationId, businessAt: sale.businessAt, totalCentavos, costCentavos,
          grossProfitCentavos: totalCentavos - costCentavos, status: 'completed' as const }];
      });
    return { date: range.date, sales };
  }

  private profit(snapshot: Snapshot, range: Range): ProfitReport {
    const sales = this.sales(snapshot, range).sales;
    const revenueCentavos = sum(sales.map((sale) => sale.totalCentavos));
    const costCentavos = sum(sales.map((sale) => sale.costCentavos));
    return { date: range.date, revenueCentavos, costCentavos, grossProfitCentavos: revenueCentavos - costCentavos };
  }

  private discrepancies(snapshot: Snapshot, range: Range): DiscrepancyReport {
    const items = snapshot.counts.filter((count) => inDay(count.countedAt, range) && atLocation(count.locationId, range))
      .flatMap((count) => snapshot.countLines.filter((line) => line.stockCountId === count.id && line.expectedPieces !== line.countedPieces)
        .map((line) => ({ locationId: count.locationId, productId: line.productId,
          productName: snapshot.products.find((product) => product.id === line.productId)?.name ?? line.productId,
          expectedPieces: line.expectedPieces, countedPieces: line.countedPieces,
          differencePieces: line.countedPieces - line.expectedPieces, countedAt: count.countedAt })))
      .sort((a, b) => compare(b.countedAt, a.countedAt) || compare(a.productName.toLowerCase(), b.productName.toLowerCase()));
    return { date: range.date, count: items.length, items };
  }

  private async read<T>(filter: ReportFilter, project: (snapshot: Snapshot, range: Range) => T): Promise<T> {
    const data = reportFilterSchema.parse(filter);
    const date = data.date ?? manilaBusinessDate();
    const range = { ...data, date, ...manilaDayRange(date) };
    return this.db.transaction('r', [this.db.products, this.db.locations, this.db.stockMovements,
      this.db.sales, this.db.saleLines, this.db.stockCounts, this.db.stockCountLines], async () => {
      const [products, locations, movements, sales, saleLines, counts, countLines] = await Promise.all([
        this.db.products.toArray(), this.db.locations.toArray(), this.db.stockMovements.toArray(),
        this.db.sales.toArray(), this.db.saleLines.toArray(), this.db.stockCounts.toArray(), this.db.stockCountLines.toArray(),
      ]);
      return project({ products, locations, movements, sales, saleLines, counts, countLines }, range);
    });
  }
}
