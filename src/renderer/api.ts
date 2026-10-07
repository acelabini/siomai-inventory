import type { InventoryApi } from '../shared/contracts';

export function getInventoryApi(): InventoryApi {
  return window.inventoryApi;
}
