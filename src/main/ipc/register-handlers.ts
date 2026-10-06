import type { IpcMain } from 'electron';
import { dialog } from 'electron';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { z } from 'zod';
import { CatalogError, type CatalogService } from '../services/catalog-service';
import { InventoryError, type InventoryService } from '../services/inventory-service';
import { SalesError, type SalesService } from '../services/sales-service';
import type { ReportService } from '../services/report-service';
import type { ImportService } from '../services/import-service';
import type { ExportService } from '../services/export-service';
import {
  completeSetupSchema,
  idSchema,
  listOptionsSchema,
  balancesQuerySchema,
  movementHistoryQuerySchema,
  replenishmentSchema,
  saveLocationSchema,
  saveProductSchema,
  setOpeningStockSchema,
  stockCountSchema,
  transferSchema,
  completeSaleSchema,
  salesListQuerySchema,
  voidSaleSchema,
  reportFilterSchema,
  csvImportRequestSchema,
  csvImportCommitSchema,
  reportExportSchema,
} from '../../shared/schemas';

type RpcResult = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } };

function errorResult(error: unknown): RpcResult {
  if (error instanceof CatalogError || error instanceof InventoryError || error instanceof SalesError) return { ok: false, error: { code: error.code, message: error.message } };
  return { ok: false, error: { code: 'INVALID_INPUT', message: 'The request could not be completed.' } };
}

export function registerCatalogHandlers(ipcMain: IpcMain, catalog: CatalogService, inventory: InventoryService, sales: SalesService, reports: ReportService, imports: ImportService, exports: ExportService): void {
  const register = <T>(channel: string, schema: z.ZodType<T>, action: (value: T) => unknown) => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (_event, input) => {
      const parsed = schema.safeParse(input);
      if (!parsed.success) return errorResult(new CatalogError('INVALID_INPUT', 'The request details are invalid.'));
      try {
        return { ok: true, data: action(parsed.data) } satisfies RpcResult;
      } catch (error) {
        return errorResult(error);
      }
    });
  };

  register('catalog:get-setup-state', z.undefined(), () => catalog.getSetupState());
  register('catalog:complete-setup', completeSetupSchema, (input) => catalog.completeSetup(input));
  register('catalog:list-products', listOptionsSchema, (options) => catalog.listProducts(options ?? {}));
  register('catalog:save-product', saveProductSchema, (input) => catalog.saveProduct(input));
  register('catalog:archive-product', idSchema, (id) => catalog.archiveProduct(id));
  register('catalog:list-locations', listOptionsSchema, (options) => catalog.listLocations(options ?? {}));
  register('catalog:save-location', saveLocationSchema, (input) => catalog.saveLocation(input));
  register('catalog:archive-location', idSchema, (id) => catalog.archiveLocation(id));
  register('inventory:set-opening-stock', setOpeningStockSchema, (input) => inventory.setOpeningStock(input));
  register('inventory:record-replenishment', replenishmentSchema, (input) => inventory.recordReplenishment(input));
  register('inventory:transfer-stock', transferSchema, (input) => inventory.transferStock(input));
  register('inventory:submit-stock-count', stockCountSchema, (input) => inventory.submitStockCount(input));
  register('inventory:get-balances', balancesQuerySchema, ({ locationId }) => inventory.getBalances(locationId));
  register('inventory:get-movement-history', movementHistoryQuerySchema, (query) => inventory.getMovementHistory(query));
  register('sales:complete', completeSaleSchema, (input) => sales.completeSale(input));
  register('sales:list', salesListQuerySchema, (query) => sales.listSales(query ?? {}));
  register('sales:void', voidSaleSchema, ({ saleId, reason }) => sales.voidSale(saleId, reason));
  register('reports:dashboard', reportFilterSchema.optional(), (filter) => reports.getDashboard(filter));
  register('reports:sales', reportFilterSchema.optional(), (filter) => reports.getSalesReport(filter));
  register('reports:movements', reportFilterSchema.optional(), (filter) => reports.getMovementReport(filter));
  register('reports:valuation', reportFilterSchema.optional(), (filter) => reports.getValuationReport(filter));
  register('reports:profit', reportFilterSchema.optional(), (filter) => reports.getProfitReport(filter));
  register('reports:discrepancies', reportFilterSchema.optional(), (filter) => reports.getDiscrepancyReport(filter));
  register('reports:low-stock', reportFilterSchema.optional(), (filter) => reports.getLowStockReport(filter));

  ipcMain.removeHandler('files:choose-csv-import');
  ipcMain.handle('files:choose-csv-import', async () => {
    const choice = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'CSV files', extensions: ['csv'] }] });
    if (choice.canceled || !choice.filePaths[0]) return { ok: true, data: null } satisfies RpcResult;
    try {
      const filePath = choice.filePaths[0];
      if (statSync(filePath).size > 5_000_000) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Choose a CSV file smaller than 5 MB.' } } satisfies RpcResult;
      return { ok: true, data: { fileName: filePath.split(/[\\/]/).pop() ?? 'import.csv', csv: readFileSync(filePath, 'utf8') } } satisfies RpcResult;
    } catch { return { ok: false, error: { code: 'INVALID_INPUT', message: 'The selected CSV file could not be read.' } } satisfies RpcResult; }
  });

  ipcMain.removeHandler('reports:export-csv');
  ipcMain.handle('reports:export-csv', async (_event, input) => {
    const parsed = reportExportSchema.safeParse(input);
    if (!parsed.success) return errorResult(new CatalogError('INVALID_INPUT', 'The export details are invalid.'));
    const { kind, filter } = parsed.data;
    const report = kind === 'profit' ? reports.getProfitReport(filter)
      : kind === 'sales' ? reports.getSalesReport(filter)
        : kind === 'movements' ? reports.getMovementReport(filter)
          : kind === 'valuation' ? reports.getValuationReport(filter)
            : kind === 'discrepancies' ? reports.getDiscrepancyReport(filter)
              : reports.getLowStockReport(filter);
    const csv = exports.reportToCsv(kind, report);
    const date = filter?.date ?? new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog({ defaultPath: `${kind}-${date}.csv`, filters: [{ name: 'CSV files', extensions: ['csv'] }] });
    if (result.canceled || !result.filePath) return { ok: true, data: false } satisfies RpcResult;
    try { writeFileSync(result.filePath, csv, 'utf8'); return { ok: true, data: true } satisfies RpcResult; }
    catch { return { ok: false, error: { code: 'INVALID_INPUT', message: 'The CSV export could not be saved.' } } satisfies RpcResult; }
  });

  register('imports:preview', csvImportRequestSchema, (input) => imports.preview(input));
  register('imports:commit', csvImportCommitSchema, (input) => imports.commit(input));
}
