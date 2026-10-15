import type { InventoryApi } from '../shared/contracts';
import { createBrowserInventoryApi } from '../browser/browser-inventory-api';

let browserApi: InventoryApi | undefined;

export function getInventoryApi(): InventoryApi {
  if (window.inventoryApi) return window.inventoryApi;
  return browserApi ??= createBrowserInventoryApi();
}
