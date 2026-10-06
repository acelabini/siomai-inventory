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

export type CatalogProduct = z.infer<typeof catalogProductSchema>;
export type SaveProductInput = z.infer<typeof saveProductSchema>;
export type CatalogLocation = z.infer<typeof catalogLocationSchema>;
export type SaveLocationInput = z.infer<typeof saveLocationSchema>;
export type CompleteSetupInput = z.infer<typeof completeSetupSchema>;
export type SetupState = z.infer<typeof setupStateSchema>;
