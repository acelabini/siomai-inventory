import type {
  CatalogLocation,
  CatalogProduct,
  CompleteSetupInput,
  SetupState,
  SaveLocationInput,
  SaveProductInput,
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
};

declare global {
  interface Window {
    inventoryApi: InventoryApi;
  }
}
