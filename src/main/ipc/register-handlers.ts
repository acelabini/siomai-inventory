import type { IpcMain } from 'electron';
import { z } from 'zod';
import { CatalogError, type CatalogService } from '../services/catalog-service';
import { InventoryError, type InventoryService } from '../services/inventory-service';
import { SalesError, type SalesService } from '../services/sales-service';
import type { ReportService } from '../services/report-service';
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
} from '../../shared/schemas';

type RpcResult = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } };

function errorResult(error: unknown): RpcResult {
  if (error instanceof CatalogError || error instanceof InventoryError || error instanceof SalesError) return { ok: false, error: { code: error.code, message: error.message } };
  return { ok: false, error: { code: 'INVALID_INPUT', message: 'The request could not be completed.' } };
}

export function registerCatalogHandlers(ipcMain: IpcMain, catalog: CatalogService, inventory: InventoryService, sales: SalesService, reports: ReportService): void {
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
}
