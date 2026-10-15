import type { InventoryApi } from '../shared/contracts';
import { updateSettingsSchema, type UpdateSettingsInput } from '../shared/schemas';
import { BrowserDatabase } from './db';
import { BrowserCatalogService } from './catalog-service';
import { BrowserInventoryService } from './inventory-service';
import { BrowserSalesService } from './sales-service';
import { BrowserReportService } from './report-service';
import { BrowserFileService, type BrowserFileOptions } from './file-service';

export type BrowserInventoryApiOptions = BrowserFileOptions & {
  db?: BrowserDatabase;
  persistStorage?: () => Promise<boolean>;
  reload?: () => void;
};
export class BrowserInventoryApi implements InventoryApi {
  private readonly db: BrowserDatabase;
  private readonly catalog: BrowserCatalogService;
  private readonly inventory: BrowserInventoryService;
  private readonly sales: BrowserSalesService;
  private readonly reports: BrowserReportService;
  private readonly files: BrowserFileService;
  private readonly persistence: Promise<boolean>;
  private readonly reload: () => void;
  constructor(options: BrowserInventoryApiOptions = {}) {
    this.db = options.db ?? new BrowserDatabase('siomai-inventory-web');
    this.catalog = new BrowserCatalogService(this.db);
    this.inventory = new BrowserInventoryService(this.db);
    this.sales = new BrowserSalesService(this.db);
    this.reports = new BrowserReportService(this.db);
    this.files = new BrowserFileService(this.db, options);
    const persist = options.persistStorage ?? (async () => typeof navigator !== 'undefined' && !!(await navigator.storage?.persist?.()));
    this.persistence = Promise.resolve().then(persist).catch(() => false);
    this.reload = options.reload ?? (() => window.location.reload());
  }
  getSetupState = (...args: Parameters<InventoryApi['getSetupState']>): ReturnType<InventoryApi['getSetupState']> => this.catalog.getSetupState(...args);
  completeSetup = (...args: Parameters<InventoryApi['completeSetup']>): ReturnType<InventoryApi['completeSetup']> => this.catalog.completeSetup(...args);
  listProducts = (...args: Parameters<InventoryApi['listProducts']>): ReturnType<InventoryApi['listProducts']> => this.catalog.listProducts(...args);
  saveProduct = (...args: Parameters<InventoryApi['saveProduct']>): ReturnType<InventoryApi['saveProduct']> => this.catalog.saveProduct(...args);
  archiveProduct = (...args: Parameters<InventoryApi['archiveProduct']>): ReturnType<InventoryApi['archiveProduct']> => this.catalog.archiveProduct(...args);
  listLocations = (...args: Parameters<InventoryApi['listLocations']>): ReturnType<InventoryApi['listLocations']> => this.catalog.listLocations(...args);
  saveLocation = (...args: Parameters<InventoryApi['saveLocation']>): ReturnType<InventoryApi['saveLocation']> => this.catalog.saveLocation(...args);
  archiveLocation = (...args: Parameters<InventoryApi['archiveLocation']>): ReturnType<InventoryApi['archiveLocation']> => this.catalog.archiveLocation(...args);
  setOpeningStock = (...args: Parameters<InventoryApi['setOpeningStock']>): ReturnType<InventoryApi['setOpeningStock']> => this.inventory.setOpeningStock(...args);
  recordReplenishment = (...args: Parameters<InventoryApi['recordReplenishment']>): ReturnType<InventoryApi['recordReplenishment']> => this.inventory.recordReplenishment(...args);
  transferStock = (...args: Parameters<InventoryApi['transferStock']>): ReturnType<InventoryApi['transferStock']> => this.inventory.transferStock(...args);
  submitStockCount = (...args: Parameters<InventoryApi['submitStockCount']>): ReturnType<InventoryApi['submitStockCount']> => this.inventory.submitStockCount(...args);
  getBalances = (...args: Parameters<InventoryApi['getBalances']>): ReturnType<InventoryApi['getBalances']> => this.inventory.getBalances(...args);
  getMovementHistory = (...args: Parameters<InventoryApi['getMovementHistory']>): ReturnType<InventoryApi['getMovementHistory']> => this.inventory.getMovementHistory(...args);
  completeSale = (...args: Parameters<InventoryApi['completeSale']>): ReturnType<InventoryApi['completeSale']> => this.sales.completeSale(...args);
  listSales = (...args: Parameters<InventoryApi['listSales']>): ReturnType<InventoryApi['listSales']> => this.sales.listSales(...args);
  voidSale = (...args: Parameters<InventoryApi['voidSale']>): ReturnType<InventoryApi['voidSale']> => this.sales.voidSale(...args);
  getDashboard = (...args: Parameters<InventoryApi['getDashboard']>): ReturnType<InventoryApi['getDashboard']> => this.reports.getDashboard(...args);
  getSalesReport = (...args: Parameters<InventoryApi['getSalesReport']>): ReturnType<InventoryApi['getSalesReport']> => this.reports.getSalesReport(...args);
  getMovementReport = (...args: Parameters<InventoryApi['getMovementReport']>): ReturnType<InventoryApi['getMovementReport']> => this.reports.getMovementReport(...args);
  getValuationReport = (...args: Parameters<InventoryApi['getValuationReport']>): ReturnType<InventoryApi['getValuationReport']> => this.reports.getValuationReport(...args);
  getProfitReport = (...args: Parameters<InventoryApi['getProfitReport']>): ReturnType<InventoryApi['getProfitReport']> => this.reports.getProfitReport(...args);
  getDiscrepancyReport = (...args: Parameters<InventoryApi['getDiscrepancyReport']>): ReturnType<InventoryApi['getDiscrepancyReport']> => this.reports.getDiscrepancyReport(...args);
  getLowStockReport = (...args: Parameters<InventoryApi['getLowStockReport']>): ReturnType<InventoryApi['getLowStockReport']> => this.reports.getLowStockReport(...args);
  chooseCsvImportFile = (...args: Parameters<InventoryApi['chooseCsvImportFile']>): ReturnType<InventoryApi['chooseCsvImportFile']> => this.files.chooseCsvImportFile(...args);
  previewCsvImport = (...args: Parameters<InventoryApi['previewCsvImport']>): ReturnType<InventoryApi['previewCsvImport']> => this.files.previewCsvImport(...args);
  commitCsvImport = (...args: Parameters<InventoryApi['commitCsvImport']>): ReturnType<InventoryApi['commitCsvImport']> => this.files.commitCsvImport(...args);
  exportReportCsv = (...args: Parameters<InventoryApi['exportReportCsv']>): ReturnType<InventoryApi['exportReportCsv']> => this.files.exportReportCsv(...args);
  createManualBackup = (...args: Parameters<InventoryApi['createManualBackup']>): ReturnType<InventoryApi['createManualBackup']> => this.files.createManualBackup(...args);
  chooseBackupFile = (...args: Parameters<InventoryApi['chooseBackupFile']>): ReturnType<InventoryApi['chooseBackupFile']> => this.files.chooseBackupFile(...args);
  restoreBackup = (...args: Parameters<InventoryApi['restoreBackup']>): ReturnType<InventoryApi['restoreBackup']> => this.files.restoreBackup(...args);
  async getSettings() {
    return { businessName: (await this.db.settings.get('business_name'))?.value ?? '', backupDirectory: '',
      runtime: 'web' as const, automaticBackups: false, storagePersistent: await this.persistence };
  }
  async saveSettings(input: UpdateSettingsInput) {
    const data = updateSettingsSchema.parse(input);
    await this.db.settings.put({ key: 'business_name', value: data.businessName });
    return data;
  }
  async chooseBackupDirectory() { return null; }
  async requestRelaunch() { this.reload(); }
}
export function createBrowserInventoryApi(options: BrowserInventoryApiOptions = {}): InventoryApi {
  return new BrowserInventoryApi(options);
}
