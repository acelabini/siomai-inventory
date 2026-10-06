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
} from './schemas';

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
};

declare global {
  interface Window {
    inventoryApi: InventoryApi;
  }
}
