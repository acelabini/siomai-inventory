import type { CatalogLocation, CatalogProduct, SaleStatus, StockMovement } from '../shared/schemas';

export type SettingRecord = { key: string; value: string };
export type LocationRecord = CatalogLocation & { createdAt: string; updatedAt: string };
export type ProductRecord = CatalogProduct & { createdAt: string; updatedAt: string };
export type InventoryBalanceRecord = { locationId: string; productId: string; quantityPieces: number; updatedAt: string };
export type OpeningStockRecord = { locationId: string; productId: string; quantityPieces: number; recordedAt: string };
export type StockMovementRecord = Omit<StockMovement, 'productName'> & { createdAt: string };
export type ReplenishmentRecord = { id: string; locationId: string; occurredAt: string; note: string | null; createdAt: string };
export type ReplenishmentLineRecord = {
  id: string; replenishmentId: string; productId: string; quantityPieces: number;
  enteredUnit: 'piece' | 'pack'; enteredQuantity: string; unitCostCentavos: number; lineCostCentavos: number;
};
export type TransferBatchRecord = { id: string; fromLocationId: string; toLocationId: string; note: string | null; createdAt: string };
export type TransferRecord = {
  id: string; transferBatchId: string | null; fromLocationId: string; toLocationId: string;
  productId: string; quantityPieces: number; occurredAt: string; note: string | null; createdAt: string;
};
export type StockCountRecord = { id: string; locationId: string; countedAt: string; note: string | null; createdAt: string };
export type StockCountLineRecord = { id: string; stockCountId: string; productId: string; expectedPieces: number; countedPieces: number; note: string | null };
export type SaleRecord = {
  id: string; locationId: string; businessAt: string; totalCentavos: number; paymentCentavos: number;
  changeCentavos: number; note: string | null; status: SaleStatus; createdAt: string;
};
export type SaleLineRecord = {
  id: string; saleId: string; productId: string; quantityPieces: number; enteredUnit: 'piece' | 'pack';
  enteredQuantity: string; unitSellingPriceCentavos: number; unitCostCentavos: number;
  lineRevenueCentavos: number; lineCostCentavos: number;
};
