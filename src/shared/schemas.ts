import { z } from 'zod';

const nonBlankText = z.string().trim().min(1, 'This field is required').max(120);
const centavos = z.number().int().min(0);

export const catalogProductSchema = z.object({
  id: z.string().min(1),
  sku: nonBlankText,
  name: nonBlankText,
  piecesPerPack: z.number().int().positive(),
  purchaseCostPerPackCentavos: centavos,
  sellingPricePerPieceCentavos: centavos,
  sellingPricePerPackCentavos: centavos,
  lowStockThresholdPieces: z.number().int().min(0),
  isActive: z.boolean(),
});

export const saveProductSchema = catalogProductSchema.omit({ id: true, isActive: true }).extend({
  id: z.string().min(1).optional(),
});

export const catalogLocationSchema = z.object({
  id: z.string().min(1),
  name: nonBlankText,
  isActive: z.boolean(),
});

export const saveLocationSchema = z.object({ id: z.string().min(1).optional(), name: nonBlankText });

export const sampleProductSchema = catalogProductSchema;

export const openingStockSchema = z.object({
  productId: z.string().min(1),
  quantityPieces: z.number().int().min(0),
});

export const completeSetupSchema = z.object({
  businessName: nonBlankText,
  locationName: nonBlankText,
  sampleProductIds: z.array(z.string().min(1)).max(100),
  openingStock: z.array(openingStockSchema).max(100),
});

export const setupStateSchema = z.object({
  complete: z.boolean(),
  businessName: z.string().nullable(),
  locations: z.array(catalogLocationSchema),
  sampleProducts: z.array(sampleProductSchema),
});

export const idSchema = z.string().min(1);
export const listOptionsSchema = z.object({ includeArchived: z.boolean().optional() }).optional();

export const quantityUnitSchema = z.enum(['piece', 'pack']);
const positiveQuantity = z.number().finite().positive().max(Number.MAX_SAFE_INTEGER);
const inventoryLineSchema = z.object({
  productId: idSchema,
  quantity: positiveQuantity,
  unit: quantityUnitSchema,
});
export const setOpeningStockSchema = z.object({ locationId: idSchema, lines: z.array(z.object({ productId: idSchema, quantity: z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER), unit: quantityUnitSchema })).min(1).max(100) });
export const replenishmentSchema = z.object({ locationId: idSchema, note: z.string().trim().max(500).optional(), lines: z.array(inventoryLineSchema).min(1).max(100) });
export const transferSchema = z.object({ fromLocationId: idSchema, toLocationId: idSchema, note: z.string().trim().max(500).optional(), lines: z.array(inventoryLineSchema).min(1).max(100) });
export const stockCountSchema = z.object({
  locationId: idSchema,
  note: z.string().trim().max(500).optional(),
  lines: z.array(z.object({ productId: idSchema, countedQuantity: z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER), unit: quantityUnitSchema, reason: z.string().trim().max(500).optional() })).min(1).max(100),
});
export const balancesQuerySchema = z.object({ locationId: idSchema });
export const movementHistoryQuerySchema = z.object({ locationId: idSchema.optional(), productId: idSchema.optional(), movementType: z.string().min(1).optional(), limit: z.number().int().positive().max(500).optional() });

export type StockQuantityInput = z.infer<typeof inventoryLineSchema>;
export type SetOpeningStockInput = z.infer<typeof setOpeningStockSchema>;
export type ReplenishmentInput = z.infer<typeof replenishmentSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type StockCountInput = z.infer<typeof stockCountSchema>;
export type MovementHistoryQuery = z.infer<typeof movementHistoryQuerySchema>;
export type InventoryBalance = { locationId: string; productId: string; quantityPieces: number; };
export type StockMovement = {
  id: string; locationId: string; productId: string; productName: string; quantityPieces: number;
  movementType: 'opening_balance' | 'replenishment' | 'transfer_in' | 'transfer_out' | 'count_adjustment' | 'sale';
  occurredAt: string; relatedEntityType: string | null; relatedEntityId: string | null; note: string | null;
  unitCostCentavos: number | null; lineCostCentavos: number | null;
};
export type InventoryReceiptLine = { productId: string; quantityPieces: number; balancePieces: number; unitCostCentavos?: number; lineCostCentavos?: number; };
export type InventoryReceipt = { id: string; lines: InventoryReceiptLine[] };
export type TransferReceipt = { id: string; lines: Array<{ productId: string; quantityPieces: number; fromBalancePieces: number; toBalancePieces: number; }> };
export type StockCountReceipt = { id: string; lines: Array<{ productId: string; expectedPieces: number; countedPieces: number; differencePieces: number; balancePieces: number; }> };

export type CatalogProduct = z.infer<typeof catalogProductSchema>;
export type SaveProductInput = z.infer<typeof saveProductSchema>;
export type CatalogLocation = z.infer<typeof catalogLocationSchema>;
export type SaveLocationInput = z.infer<typeof saveLocationSchema>;
export type CompleteSetupInput = z.infer<typeof completeSetupSchema>;
export type SetupState = z.infer<typeof setupStateSchema>;
