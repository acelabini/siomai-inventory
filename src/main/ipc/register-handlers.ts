import type { IpcMain } from 'electron';
import { z } from 'zod';
import { CatalogError, type CatalogService } from '../services/catalog-service';
import {
  completeSetupSchema,
  idSchema,
  listOptionsSchema,
  saveLocationSchema,
  saveProductSchema,
} from '../../shared/schemas';

type RpcResult = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } };

function errorResult(error: unknown): RpcResult {
  if (error instanceof CatalogError) return { ok: false, error: { code: error.code, message: error.message } };
  return { ok: false, error: { code: 'INVALID_INPUT', message: 'The request could not be completed.' } };
}

export function registerCatalogHandlers(ipcMain: IpcMain, catalog: CatalogService): void {
  const register = <T>(channel: string, schema: z.ZodType<T>, action: (value: T) => unknown) => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (_event, input) => {
      const parsed = schema.safeParse(input);
      if (!parsed.success) return errorResult(new CatalogError('INVALID_INPUT', 'The request details are invalid.'));
      try {
        return { ok: true, data: action(parsed.data) } satisfies RpcResult;
      } catch (error) {
        return errorResult(error);
      }
    });
  };

  register('catalog:get-setup-state', z.undefined(), () => catalog.getSetupState());
  register('catalog:complete-setup', completeSetupSchema, (input) => catalog.completeSetup(input));
  register('catalog:list-products', listOptionsSchema, (options) => catalog.listProducts(options ?? {}));
  register('catalog:save-product', saveProductSchema, (input) => catalog.saveProduct(input));
  register('catalog:archive-product', idSchema, (id) => catalog.archiveProduct(id));
  register('catalog:list-locations', listOptionsSchema, (options) => catalog.listLocations(options ?? {}));
  register('catalog:save-location', saveLocationSchema, (input) => catalog.saveLocation(input));
  register('catalog:archive-location', idSchema, (id) => catalog.archiveLocation(id));
}
