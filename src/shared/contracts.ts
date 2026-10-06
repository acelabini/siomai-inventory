import type {
  CatalogLocation,
  CatalogProduct,
  CompleteSetupInput,
  SetupState,
  SaveLocationInput,
  SaveProductInput,
  InventoryBalance,
  InventoryReceipt,
  MovementHistoryQuery,
  ReplenishmentInput,
  SetOpeningStockInput,
  StockCountInput,
  StockCountReceipt,
  StockMovement,
  TransferInput,
  TransferReceipt,
  CompleteSaleInput,
  SalesListQuery,
  SaleReceipt,
  SaleSummary,
  ReportFilter,
  ImportPreview,
  CsvImportCommitInput,
  CsvImportRequest,
  UpdateSettingsInput,
} from './schemas';

export type DashboardProduct = { productId: string; sku: string; productName: string; piecesPerPack: number; openingPieces: number; replenishedPieces: number; soldPieces: number; remainingPieces: number; stockValueCentavos: number; lowStockThresholdPieces: number; isLowStock: boolean };
export type DashboardReport = { locationId: string | null; date: string; metrics: { revenueCentavos: number; costCentavos: number; grossProfitCentavos: number; stockValueCentavos: number; discrepancyCount: number; lowStockCount: number }; products: DashboardProduct[] };
export type SalesReport = { date: string; sales: Array<{ id: string; locationId: string; businessAt: string; totalCentavos: number; costCentavos: number; grossProfitCentavos: number; status: 'completed' }> };
export type MovementReport = { date: string; movements: StockMovement[] };
export type ValuationReport = { date: string; totalValueCentavos: number; items: Array<{ locationId: string; productId: string; productName: string; quantityPieces: number; valueCentavos: number }> };
export type ProfitReport = { date: string; revenueCentavos: number; costCentavos: number; grossProfitCentavos: number };
export type DiscrepancyReport = { date: string; count: number; items: Array<{ locationId: string; productId: string; productName: string; expectedPieces: number; countedPieces: number; differencePieces: number; countedAt: string }> };
export type LowStockReport = { date: string; count: number; items: Array<{ locationId: string; productId: string; productName: string; quantityPieces: number; lowStockThresholdPieces: number }> };

export type InventoryApi = {
  getSetupState(): Promise<SetupState>;
  completeSetup(input: CompleteSetupInput): Promise<{ complete: true; businessName: string; locationId: string }>;
  listProducts(options?: { includeArchived?: boolean }): Promise<CatalogProduct[]>;
  saveProduct(input: SaveProductInput): Promise<CatalogProduct>;
  archiveProduct(id: string): Promise<void>;
  listLocations(options?: { includeArchived?: boolean }): Promise<CatalogLocation[]>;
  saveLocation(input: SaveLocationInput): Promise<CatalogLocation>;
  archiveLocation(id: string): Promise<void>;
  setOpeningStock(input: SetOpeningStockInput): Promise<InventoryReceipt>;
  recordReplenishment(input: ReplenishmentInput): Promise<InventoryReceipt>;
  transferStock(input: TransferInput): Promise<TransferReceipt>;
  submitStockCount(input: StockCountInput): Promise<StockCountReceipt>;
  getBalances(locationId: string): Promise<InventoryBalance[]>;
  getMovementHistory(query?: MovementHistoryQuery): Promise<StockMovement[]>;
  completeSale(input: CompleteSaleInput): Promise<SaleReceipt>;
  listSales(query?: SalesListQuery): Promise<SaleSummary[]>;
  voidSale(saleId: string, reason: string): Promise<SaleReceipt>;
  getDashboard(filter?: ReportFilter): Promise<DashboardReport>;
  getSalesReport(filter?: ReportFilter): Promise<SalesReport>;
  getMovementReport(filter?: ReportFilter): Promise<MovementReport>;
  getValuationReport(filter?: ReportFilter): Promise<ValuationReport>;
  getProfitReport(filter?: ReportFilter): Promise<ProfitReport>;
  getDiscrepancyReport(filter?: ReportFilter): Promise<DiscrepancyReport>;
  getLowStockReport(filter?: ReportFilter): Promise<LowStockReport>;
  chooseCsvImportFile(): Promise<{ fileName: string; csv: string } | null>;
  previewCsvImport(request: CsvImportRequest): Promise<ImportPreview>;
  commitCsvImport(input: CsvImportCommitInput): Promise<{ importedRows: number; aggregate: boolean }>;
  exportReportCsv(kind: 'profit' | 'sales' | 'movements' | 'valuation' | 'discrepancies' | 'low-stock', filter?: ReportFilter): Promise<boolean>;
  getSettings(): Promise<{ businessName: string; backupDirectory: string }>;
  saveSettings(input: UpdateSettingsInput): Promise<{ businessName: string }>;
  chooseBackupDirectory(): Promise<string | null>;
  createManualBackup(): Promise<{ fileName: string }>;
  chooseBackupFile(): Promise<{ filePath: string; fileName: string } | null>;
  restoreBackup(filePath: string): Promise<void>;
  requestRelaunch(): Promise<void>;
};

declare global {
  interface Window {
    inventoryApi: InventoryApi;
  }
}
