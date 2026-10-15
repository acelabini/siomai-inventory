import type { CatalogProduct } from './schemas';

type SampleProduct = Omit<CatalogProduct, 'lowStockThresholdPieces' | 'isActive'>;

export const sampleProducts: readonly SampleProduct[] = [
  { id: 'siomai-pork', sku: 'SIO-PORK', name: 'Siomai Pork', piecesPerPack: 66, purchaseCostPerPackCentavos: 14600, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0 },
  { id: 'siomai-beef', sku: 'SIO-BEEF', name: 'Siomai Beef', piecesPerPack: 60, purchaseCostPerPackCentavos: 14000, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0 },
  { id: 'siomai-japanese', sku: 'SIO-JAPANESE', name: 'Siomai Japanese', piecesPerPack: 30, purchaseCostPerPackCentavos: 9500, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0 },
  { id: 'big-siomai-pork', sku: 'BIG-PORK', name: 'Big Siomai Pork', piecesPerPack: 20, purchaseCostPerPackCentavos: 11000, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0 },
  { id: 'big-siomai-japanese', sku: 'BIG-JAPANESE', name: 'Big Siomai Japanese', piecesPerPack: 20, purchaseCostPerPackCentavos: 14800, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0 },
];
