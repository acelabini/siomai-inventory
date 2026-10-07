import { contextBridge, ipcRenderer } from 'electron';
import type { InventoryApi } from './shared/contracts';

type RpcReply<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

async function call<T>(channel: string, input?: unknown): Promise<T> {
  const reply = await ipcRenderer.invoke(channel, input) as RpcReply<T>;
  if (!reply.ok) {
    const error = new Error(reply.error.message) as Error & { code: string };
    error.code = reply.error.code;
    throw error;
  }
  return reply.data;
}

const inventoryApi: InventoryApi = {
  getSetupState: () => call('catalog:get-setup-state'),
  completeSetup: (input) => call('catalog:complete-setup', input),
  listProducts: (options) => call('catalog:list-products', options),
  saveProduct: (input) => call('catalog:save-product', input),
  archiveProduct: (id) => call('catalog:archive-product', id),
  listLocations: (options) => call('catalog:list-locations', options),
  saveLocation: (input) => call('catalog:save-location', input),
  archiveLocation: (id) => call('catalog:archive-location', id),
  setOpeningStock: (input) => call('inventory:set-opening-stock', input),
  recordReplenishment: (input) => call('inventory:record-replenishment', input),
  transferStock: (input) => call('inventory:transfer-stock', input),
  submitStockCount: (input) => call('inventory:submit-stock-count', input),
  getBalances: (locationId) => call('inventory:get-balances', { locationId }),
  getMovementHistory: (query) => call('inventory:get-movement-history', query),
  completeSale: (input) => call('sales:complete', input),
  listSales: (query) => call('sales:list', query),
  voidSale: (saleId, reason) => call('sales:void', { saleId, reason }),
  getDashboard: (filter) => call('reports:dashboard', filter),
  getSalesReport: (filter) => call('reports:sales', filter),
  getMovementReport: (filter) => call('reports:movements', filter),
  getValuationReport: (filter) => call('reports:valuation', filter),
  getProfitReport: (filter) => call('reports:profit', filter),
  getDiscrepancyReport: (filter) => call('reports:discrepancies', filter),
  getLowStockReport: (filter) => call('reports:low-stock', filter),
  chooseCsvImportFile: () => call('files:choose-csv-import'),
  previewCsvImport: (request) => call('imports:preview', request),
  commitCsvImport: (input) => call('imports:commit', input),
  exportReportCsv: (kind, filter) => call('reports:export-csv', { kind, filter }),
  getSettings: () => call('settings:get'),
  saveSettings: (input) => call('settings:save', input),
  chooseBackupDirectory: () => call('backups:choose-directory'),
  createManualBackup: () => call('backups:create-manual'),
  chooseBackupFile: () => call('backups:choose-file'),
  restoreBackup: (filePath) => call('backups:restore', filePath),
  requestRelaunch: () => call('app:relaunch'),
};

contextBridge.exposeInMainWorld('inventoryApi', inventoryApi satisfies InventoryApi);
