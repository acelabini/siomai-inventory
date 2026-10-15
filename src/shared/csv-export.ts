import type { ProfitReport, SalesReport, MovementReport, ValuationReport, DiscrepancyReport, LowStockReport } from './contracts';

export type ExportableReport = ProfitReport | SalesReport | MovementReport | ValuationReport | DiscrepancyReport | LowStockReport;

function csvField(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function money(centavos: number): string {
  return `₱${(centavos / 100).toFixed(2)}`;
}

function serialize(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

export class ExportService {
  reportToCsv(kind: string, report: ExportableReport | Record<string, unknown>): string {
    if (kind === 'profit') {
      const value = report as ProfitReport & Record<string, unknown>;
      return serialize(['date', 'revenue', 'cost', 'grossProfit', 'label', 'note'], [[value.date, money(value.revenueCentavos), money(value.costCentavos), money(value.grossProfitCentavos), value.label, value.note]]);
    }
    if (kind === 'sales') {
      const value = report as SalesReport;
      return serialize(['id', 'locationId', 'businessAt', 'revenue', 'cost', 'grossProfit', 'status'], value.sales.map((sale) => [sale.id, sale.locationId, sale.businessAt, money(sale.totalCentavos), money(sale.costCentavos), money(sale.grossProfitCentavos), sale.status]));
    }
    if (kind === 'movements') {
      const value = report as MovementReport;
      return serialize(['id', 'product', 'movement', 'quantityPieces', 'occurredAt', 'note'], value.movements.map((movement) => [movement.id, movement.productName, movement.movementType, movement.quantityPieces, movement.occurredAt, movement.note]));
    }
    if (kind === 'valuation') {
      const value = report as ValuationReport;
      return serialize(['locationId', 'product', 'quantityPieces', 'value'], value.items.map((item) => [item.locationId, item.productName, item.quantityPieces, money(item.valueCentavos)]));
    }
    if (kind === 'discrepancies') {
      const value = report as DiscrepancyReport;
      return serialize(['locationId', 'product', 'expectedPieces', 'countedPieces', 'differencePieces', 'countedAt'], value.items.map((item) => [item.locationId, item.productName, item.expectedPieces, item.countedPieces, item.differencePieces, item.countedAt]));
    }
    if (kind === 'low-stock') {
      const value = report as LowStockReport;
      return serialize(['locationId', 'product', 'quantityPieces', 'lowStockThresholdPieces'], value.items.map((item) => [item.locationId, item.productName, item.quantityPieces, item.lowStockThresholdPieces]));
    }
    throw new Error('This report cannot be exported.');
  }
}
