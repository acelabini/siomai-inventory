import { contextBridge } from 'electron';
import type { InventoryApi } from './shared/contracts';

contextBridge.exposeInMainWorld('inventoryApi', {} satisfies InventoryApi);
