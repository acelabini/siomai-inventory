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
};

contextBridge.exposeInMainWorld('inventoryApi', inventoryApi satisfies InventoryApi);
