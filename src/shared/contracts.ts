export type InventoryApi = Record<string, never>;

declare global {
  interface Window {
    inventoryApi: InventoryApi;
  }
}
