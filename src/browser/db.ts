import Dexie, { type Table } from 'dexie';
import type {
  InventoryBalanceRecord, LocationRecord, OpeningStockRecord, ProductRecord, ReplenishmentLineRecord,
  ReplenishmentRecord, SaleLineRecord, SaleRecord, SettingRecord, StockCountLineRecord,
  StockCountRecord, StockMovementRecord, TransferBatchRecord, TransferRecord,
} from './records';

export class BrowserDatabase extends Dexie {
  settings!: Table<SettingRecord, string>;
  locations!: Table<LocationRecord, string>;
  products!: Table<ProductRecord, string>;
  inventoryBalances!: Table<InventoryBalanceRecord, [string, string]>;
  openingStockRecords!: Table<OpeningStockRecord, [string, string]>;
  stockMovements!: Table<StockMovementRecord, string>;
  replenishments!: Table<ReplenishmentRecord, string>;
  replenishmentLines!: Table<ReplenishmentLineRecord, string>;
  transferBatches!: Table<TransferBatchRecord, string>;
  transfers!: Table<TransferRecord, string>;
  stockCounts!: Table<StockCountRecord, string>;
  stockCountLines!: Table<StockCountLineRecord, string>;
  sales!: Table<SaleRecord, string>;
  saleLines!: Table<SaleLineRecord, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      settings: 'key',
      locations: 'id, &name',
      products: 'id, &sku, name',
      inventoryBalances: '[locationId+productId], locationId, productId',
      openingStockRecords: '[locationId+productId], locationId, productId, recordedAt',
      stockMovements: 'id, locationId, productId, movementType, occurredAt, [locationId+occurredAt], [productId+occurredAt], relatedEntityId',
      replenishments: 'id, locationId, occurredAt, [locationId+occurredAt]',
      replenishmentLines: 'id, replenishmentId, productId, &[replenishmentId+productId]',
      transferBatches: 'id, fromLocationId, toLocationId, createdAt',
      transfers: 'id, transferBatchId, fromLocationId, toLocationId, productId, occurredAt, [fromLocationId+occurredAt], [toLocationId+occurredAt]',
      stockCounts: 'id, locationId, countedAt, [locationId+countedAt]',
      stockCountLines: 'id, stockCountId, productId, &[stockCountId+productId]',
      sales: 'id, locationId, businessAt, status, [locationId+businessAt], [status+businessAt]',
      saleLines: 'id, saleId, productId',
    });
  }
}

export function createBrowserDatabase(name: string): BrowserDatabase {
  return new BrowserDatabase(name);
}

export async function deleteBrowserDatabase(name: string): Promise<void> {
  await Dexie.delete(name);
}
