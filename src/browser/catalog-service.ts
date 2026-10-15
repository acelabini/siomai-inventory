import {
  completeSetupSchema, idSchema, listOptionsSchema, saveLocationSchema, saveProductSchema,
  type CatalogLocation, type CatalogProduct, type CompleteSetupInput, type SaveLocationInput,
  type SaveProductInput, type SetupState,
} from '../shared/schemas';
import { sampleProducts } from '../shared/sample-products';
import type { BrowserDatabase } from './db';
import type { LocationRecord, ProductRecord } from './records';

type CatalogErrorCode = 'INVALID_INPUT' | 'DUPLICATE_SKU' | 'DUPLICATE_LOCATION' | 'NOT_FOUND'
  | 'LAST_ACTIVE_LOCATION' | 'SETUP_ALREADY_COMPLETE' | 'INVALID_SAMPLE_PRODUCT';

export class BrowserCatalogError extends Error {
  constructor(readonly code: CatalogErrorCode, message: string) {
    super(message);
    this.name = 'CatalogError';
  }
}

function parse<T>(schema: { parse(input: unknown): T }, input: unknown): T {
  try { return schema.parse(input); } catch {
    throw new BrowserCatalogError('INVALID_INPUT', 'The catalog details are invalid. Check the fields and try again.');
  }
}

function productView(record: ProductRecord): CatalogProduct {
  const { id, sku, name, piecesPerPack, purchaseCostPerPackCentavos, sellingPricePerPieceCentavos,
    sellingPricePerPackCentavos, lowStockThresholdPieces, isActive } = record;
  return { id, sku, name, piecesPerPack, purchaseCostPerPackCentavos, sellingPricePerPieceCentavos,
    sellingPricePerPackCentavos, lowStockThresholdPieces, isActive };
}

function locationView({ id, name, isActive }: LocationRecord): CatalogLocation {
  return { id, name, isActive };
}

function catalogOrder(a: { id: string; name: string }, b: { id: string; name: string }): number {
  const left = a.name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  const right = b.name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return left < right ? -1 : left > right ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export class BrowserCatalogService {
  constructor(private readonly db: BrowserDatabase) {}

  async getSetupState(): Promise<SetupState> {
    return this.db.transaction('r', this.db.settings, this.db.locations, async () => ({
      complete: (await this.db.settings.get('setup_complete'))?.value === 'true',
      businessName: (await this.db.settings.get('business_name'))?.value ?? null,
      locations: await this.listLocations(),
      sampleProducts: sampleProducts.map((product) => ({ ...product, lowStockThresholdPieces: 0, isActive: true })),
    }));
  }

  async completeSetup(input: CompleteSetupInput): Promise<{ complete: true; businessName: string; locationId: string }> {
    const data = parse(completeSetupSchema, input);
    if (new Set(data.sampleProductIds).size !== data.sampleProductIds.length) {
      throw new BrowserCatalogError('INVALID_INPUT', 'Select each sample product only once.');
    }
    const samplesById = new Map(sampleProducts.map((product) => [product.id, product]));
    if (data.sampleProductIds.some((id) => !samplesById.has(id))) {
      throw new BrowserCatalogError('INVALID_SAMPLE_PRODUCT', 'One or more sample products are unavailable.');
    }
    const opening = new Map<string, number>();
    for (const line of data.openingStock) {
      if (opening.has(line.productId) || !data.sampleProductIds.includes(line.productId)) {
        throw new BrowserCatalogError('INVALID_INPUT', 'Opening stock must refer to one selected product exactly once.');
      }
      opening.set(line.productId, line.quantityPieces);
    }
    const locationId = crypto.randomUUID();
    await this.db.transaction('rw', [this.db.settings, this.db.locations, this.db.products,
      this.db.inventoryBalances, this.db.openingStockRecords, this.db.stockMovements], async () => {
      if ((await this.db.settings.get('setup_complete'))?.value === 'true') {
        throw new BrowserCatalogError('SETUP_ALREADY_COMPLETE', 'Setup has already been completed.');
      }
      const now = new Date().toISOString();
      await this.db.settings.bulkAdd([
        { key: 'business_name', value: data.businessName }, { key: 'setup_complete', value: 'true' },
      ]);
      await this.db.locations.add({ id: locationId, name: data.locationName, isActive: true, createdAt: now, updatedAt: now });
      for (const productId of data.sampleProductIds) {
        await this.db.products.add({ ...samplesById.get(productId)!, lowStockThresholdPieces: 0, isActive: true, createdAt: now, updatedAt: now });
        const quantityPieces = opening.get(productId) ?? 0;
        await this.db.inventoryBalances.add({ locationId, productId, quantityPieces, updatedAt: now });
        await this.db.openingStockRecords.add({ locationId, productId, quantityPieces, recordedAt: now });
        if (quantityPieces > 0) {
          await this.db.stockMovements.add({
            id: crypto.randomUUID(), locationId, productId, quantityPieces, movementType: 'opening_balance',
            occurredAt: now, createdAt: now, relatedEntityType: null, relatedEntityId: null,
            note: 'First-run opening stock', unitCostCentavos: null, lineCostCentavos: null,
          });
        }
      }
    });
    return { complete: true, businessName: data.businessName, locationId };
  }

  async listProducts(options?: { includeArchived?: boolean }): Promise<CatalogProduct[]> {
    const data = parse(listOptionsSchema, options);
    const products = await this.db.products.toArray();
    return products.filter((product) => data?.includeArchived || product.isActive).sort(catalogOrder).map(productView);
  }

  async saveProduct(input: SaveProductInput): Promise<CatalogProduct> {
    const data = parse(saveProductSchema, input);
    return this.db.transaction('rw', this.db.products, async () => {
      const existing = data.id ? await this.db.products.get(data.id) : undefined;
      if (data.id && !existing?.isActive) throw new BrowserCatalogError('NOT_FOUND', 'The product is no longer active.');
      const duplicate = await this.db.products.where('sku').equals(data.sku).first();
      if (duplicate && duplicate.id !== data.id) throw new BrowserCatalogError('DUPLICATE_SKU', 'That SKU is already in use.');
      const now = new Date().toISOString();
      const product: ProductRecord = { ...data, id: data.id ?? crypto.randomUUID(), isActive: true, createdAt: existing?.createdAt ?? now, updatedAt: now };
      await this.db.products.put(product);
      return productView(product);
    });
  }

  async archiveProduct(id: string): Promise<void> {
    const productId = parse(idSchema, id);
    await this.db.transaction('rw', this.db.products, async () => {
      const product = await this.db.products.get(productId);
      if (!product?.isActive) throw new BrowserCatalogError('NOT_FOUND', 'The product is no longer active.');
      await this.db.products.update(productId, { isActive: false, updatedAt: new Date().toISOString() });
    });
  }

  async listLocations(options?: { includeArchived?: boolean }): Promise<CatalogLocation[]> {
    const data = parse(listOptionsSchema, options);
    const locations = await this.db.locations.toArray();
    return locations.filter((location) => data?.includeArchived || location.isActive).sort(catalogOrder).map(locationView);
  }

  async saveLocation(input: SaveLocationInput): Promise<CatalogLocation> {
    const data = parse(saveLocationSchema, input);
    return this.db.transaction('rw', this.db.locations, async () => {
      const existing = data.id ? await this.db.locations.get(data.id) : undefined;
      if (data.id && !existing?.isActive) throw new BrowserCatalogError('NOT_FOUND', 'The location is no longer active.');
      const duplicate = await this.db.locations.where('name').equals(data.name).first();
      if (duplicate && duplicate.id !== data.id) throw new BrowserCatalogError('DUPLICATE_LOCATION', 'That location name is already in use.');
      const now = new Date().toISOString();
      const location: LocationRecord = { id: data.id ?? crypto.randomUUID(), name: data.name, isActive: true, createdAt: existing?.createdAt ?? now, updatedAt: now };
      await this.db.locations.put(location);
      return locationView(location);
    });
  }

  async archiveLocation(id: string): Promise<void> {
    const locationId = parse(idSchema, id);
    await this.db.transaction('rw', this.db.locations, async () => {
      const location = await this.db.locations.get(locationId);
      if (!location?.isActive) throw new BrowserCatalogError('NOT_FOUND', 'The location is no longer active.');
      if (await this.db.locations.filter((item) => item.isActive).count() <= 1) {
        throw new BrowserCatalogError('LAST_ACTIVE_LOCATION', 'At least one active location must remain.');
      }
      await this.db.locations.update(locationId, { isActive: false, updatedAt: new Date().toISOString() });
    });
  }
}
