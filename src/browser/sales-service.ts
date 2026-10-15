import type { InventoryApi } from '../shared/contracts';
import {
  completeSaleSchema, salesListQuerySchema, voidSaleSchema,
  type CompleteSaleInput, type SaleReceipt, type SaleSummary, type SalesListQuery,
} from '../shared/schemas';
import { toPieces } from '../shared/quantities';
import { decimalQuantityPriceCentavos } from '../shared/money';
import type { BrowserDatabase } from './db';
import type { SaleLineRecord, SaleRecord } from './records';

type SalesErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'INSUFFICIENT_STOCK' | 'INSUFFICIENT_PAYMENT' | 'PRICE_NOT_SET' | 'ALREADY_VOIDED';

export class BrowserSalesError extends Error {
  constructor(readonly code: SalesErrorCode, message: string) {
    super(message);
    this.name = 'SalesError';
  }
}

function parseInput<T>(schema: { parse(input: unknown): T }, input: unknown): T {
  try { return schema.parse(input); } catch {
    throw new BrowserSalesError('INVALID_INPUT', 'The sale details are invalid. Check quantities and amounts and try again.');
  }
}

function safe(value: number): number {
  if (!Number.isSafeInteger(value)) throw new BrowserSalesError('INVALID_INPUT', 'A sale amount or quantity exceeds the safe range.');
  return value;
}

function proratedCost(packCost: number, packSize: number, pieces: number): number {
  const denominator = BigInt(safe(packSize));
  return safe(Number((BigInt(safe(packCost)) * BigInt(pieces) + denominator / 2n) / denominator));
}

export class BrowserSalesService implements Pick<InventoryApi, 'completeSale' | 'listSales' | 'voidSale'> {
  constructor(private readonly db: BrowserDatabase) {}

  async completeSale(input: CompleteSaleInput): Promise<SaleReceipt> {
    const data = parseInput(completeSaleSchema, input);
    return this.mutate(async () => {
      if (!(await this.db.locations.get(data.locationId))?.isActive) throw new BrowserSalesError('NOT_FOUND', 'The location is no longer active.');
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const lines: SaleLineRecord[] = [];
      const grouped = new Map<string, { name: string; quantityPieces: number; unitCostCentavos: number; lineCostCentavos: number }>();
      let totalCentavos = 0;
      for (const [lineIndex, line] of data.lines.entries()) {
        const product = await this.db.products.get(line.productId);
        if (!product?.isActive) throw new BrowserSalesError('NOT_FOUND', 'The product is no longer active.');
        const quantityPieces = toPieces(line.quantity, line.unit, product.piecesPerPack);
        const unitSellingPriceCentavos = safe(line.unit === 'pack' ? product.sellingPricePerPackCentavos : product.sellingPricePerPieceCentavos);
        if (unitSellingPriceCentavos <= 0) throw new BrowserSalesError('PRICE_NOT_SET', `${product.name} has no selling price for ${line.unit}s.`);
        const lineRevenueCentavos = decimalQuantityPriceCentavos(line.unit === 'pack' ? line.quantity : quantityPieces, unitSellingPriceCentavos);
        const unitCostCentavos = safe(product.purchaseCostPerPackCentavos);
        const lineCostCentavos = proratedCost(unitCostCentavos, product.piecesPerPack, quantityPieces);
        totalCentavos = safe(totalCentavos + lineRevenueCentavos);
        lines.push({ id: crypto.randomUUID(), saleId: id, lineIndex, productId: product.id, quantityPieces,
          enteredUnit: line.unit, enteredQuantity: String(line.quantity), unitSellingPriceCentavos,
          unitCostCentavos, lineRevenueCentavos, lineCostCentavos });
        const previous = grouped.get(product.id);
        grouped.set(product.id, { name: product.name, unitCostCentavos,
          quantityPieces: safe((previous?.quantityPieces ?? 0) + quantityPieces),
          lineCostCentavos: safe((previous?.lineCostCentavos ?? 0) + lineCostCentavos) });
      }
      if (data.paymentCentavos < totalCentavos) throw new BrowserSalesError('INSUFFICIENT_PAYMENT', 'Payment must cover the full sale total.');
      const sale: SaleRecord = { id, locationId: data.locationId, businessAt: now, createdAt: now,
        totalCentavos, paymentCentavos: data.paymentCentavos, changeCentavos: data.paymentCentavos - totalCentavos,
        note: data.note || null, status: 'completed' };
      await this.db.sales.add(sale);
      await this.db.saleLines.bulkAdd(lines);
      for (const [productId, item] of grouped) {
        if (await this.balance(data.locationId, productId) < item.quantityPieces) throw new BrowserSalesError('INSUFFICIENT_STOCK', `Not enough ${item.name} is available.`);
        await this.db.stockMovements.add({ id: crypto.randomUUID(), locationId: data.locationId, productId,
          quantityPieces: -item.quantityPieces, movementType: 'sale', occurredAt: now, createdAt: now,
          relatedEntityType: 'sale', relatedEntityId: id, note: sale.note,
          unitCostCentavos: item.unitCostCentavos, lineCostCentavos: item.lineCostCentavos });
        await this.applyDelta(data.locationId, productId, -item.quantityPieces, now);
      }
      return this.receipt(sale);
    });
  }

  async listSales(query: SalesListQuery = {}): Promise<SaleSummary[]> {
    const data = parseInput(salesListQuerySchema, query);
    return this.db.transaction('r', [this.db.sales, this.db.saleLines, this.db.products, this.db.inventoryBalances], async () => {
      const records = await this.db.sales.orderBy('businessAt').reverse().filter((sale) =>
        (!data?.locationId || sale.locationId === data.locationId) && (!data?.status || sale.status === data.status))
        .limit(data?.limit ?? 200).toArray();
      return Promise.all(records.map(async (sale) => {
        const receipt = await this.receipt(sale);
        return { ...receipt, lines: receipt.lines.map((line) => ({
          productId: line.productId, productName: line.productName, quantityPieces: line.quantityPieces,
          enteredUnit: line.enteredUnit, enteredQuantity: line.enteredQuantity,
          unitSellingPriceCentavos: line.unitSellingPriceCentavos, unitCostCentavos: line.unitCostCentavos,
          lineRevenueCentavos: line.lineRevenueCentavos, lineCostCentavos: line.lineCostCentavos,
        })) };
      }));
    });
  }

  async voidSale(saleId: string, reason: string): Promise<SaleReceipt> {
    const data = parseInput(voidSaleSchema, { saleId, reason });
    return this.mutate(async () => {
      const sale = await this.db.sales.get(data.saleId);
      if (!sale) throw new BrowserSalesError('NOT_FOUND', 'The sale could not be found.');
      if (sale.status === 'voided') throw new BrowserSalesError('ALREADY_VOIDED', 'This sale has already been voided.');
      const grouped = new Map<string, number>();
      for (const line of await this.db.saleLines.where('saleId').equals(sale.id).toArray()) {
        grouped.set(line.productId, safe((grouped.get(line.productId) ?? 0) + line.quantityPieces));
      }
      const now = new Date().toISOString();
      sale.status = 'voided';
      await this.db.sales.put(sale);
      for (const [productId, quantityPieces] of grouped) {
        await this.db.stockMovements.add({ id: crypto.randomUUID(), locationId: sale.locationId, productId,
          quantityPieces, movementType: 'sale_void', occurredAt: now, createdAt: now,
          relatedEntityType: 'sale_void', relatedEntityId: sale.id, note: data.reason,
          unitCostCentavos: null, lineCostCentavos: null });
        await this.applyDelta(sale.locationId, productId, quantityPieces, now);
      }
      return this.receipt(sale);
    });
  }

  private async receipt(sale: SaleRecord): Promise<SaleReceipt> {
    const records = await this.db.saleLines.where('saleId').equals(sale.id).sortBy('lineIndex');
    const lines = await Promise.all(records.map(async (line) => ({ productId: line.productId,
      productName: (await this.db.products.get(line.productId))?.name ?? line.productId,
      quantityPieces: line.quantityPieces, enteredUnit: line.enteredUnit, enteredQuantity: line.enteredQuantity,
      unitSellingPriceCentavos: line.unitSellingPriceCentavos, unitCostCentavos: line.unitCostCentavos,
      lineRevenueCentavos: line.lineRevenueCentavos, lineCostCentavos: line.lineCostCentavos,
      balancePieces: await this.balance(sale.locationId, line.productId) })));
    return { id: sale.id, locationId: sale.locationId, businessAt: sale.businessAt, totalCentavos: sale.totalCentavos,
      paymentCentavos: sale.paymentCentavos, changeCentavos: sale.changeCentavos, status: sale.status, note: sale.note, lines };
  }

  private async balance(locationId: string, productId: string): Promise<number> {
    return (await this.db.inventoryBalances.get([locationId, productId]))?.quantityPieces ?? 0;
  }

  private async applyDelta(locationId: string, productId: string, delta: number, now: string): Promise<void> {
    const quantityPieces = safe(await this.balance(locationId, productId) + delta);
    if (quantityPieces < 0) throw new BrowserSalesError('INSUFFICIENT_STOCK', 'The stock balance cannot be negative or exceed the safe range.');
    await this.db.inventoryBalances.put({ locationId, productId, quantityPieces, updatedAt: now });
  }

  private async mutate<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction('rw', [this.db.locations, this.db.products, this.db.sales,
        this.db.saleLines, this.db.stockMovements, this.db.inventoryBalances], action);
    } catch (error) {
      if (error instanceof BrowserSalesError) throw error;
      if (error instanceof RangeError) throw new BrowserSalesError('INVALID_INPUT', 'Quantity must convert to a whole piece.');
      throw new BrowserSalesError('INVALID_INPUT', 'The sale could not be completed. Check the details and try again.');
    }
  }
}
