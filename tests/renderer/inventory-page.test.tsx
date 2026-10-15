// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventoryApi } from '../../src/shared/contracts';
import type { CatalogLocation, CatalogProduct, StockMovement } from '../../src/shared/schemas';
import InventoryPage from '../../src/renderer/pages/InventoryPage';

afterEach(cleanup);

const location: CatalogLocation = { id: 'main', name: 'Main Cart', isActive: true };
const products: CatalogProduct[] = [
  { id: 'pork', sku: 'PORK-01', name: 'Siomai Pork', piecesPerPack: 66, purchaseCostPerPackCentavos: 14600, sellingPricePerPieceCentavos: 300, sellingPricePerPackCentavos: 19000, lowStockThresholdPieces: 10, isActive: true },
  { id: 'beef', sku: 'BEEF-02', name: 'Siomai Beef', piecesPerPack: 60, purchaseCostPerPackCentavos: 12000, sellingPricePerPieceCentavos: 300, sellingPricePerPackCentavos: 17000, lowStockThresholdPieces: 10, isActive: true },
  { id: 'shrimp', sku: 'SHRIMP-03', name: 'Siomai Shrimp', piecesPerPack: 50, purchaseCostPerPackCentavos: 10000, sellingPricePerPieceCentavos: 350, sellingPricePerPackCentavos: 16000, lowStockThresholdPieces: 10, isActive: true },
];

function makeApi(overrides: Partial<InventoryApi> = {}): InventoryApi {
  return {
    getSetupState: vi.fn(), completeSetup: vi.fn(), listProducts: vi.fn().mockResolvedValue(products), saveProduct: vi.fn(), archiveProduct: vi.fn(),
    listLocations: vi.fn().mockResolvedValue([location]), saveLocation: vi.fn(), archiveLocation: vi.fn(),
    getBalances: vi.fn().mockResolvedValue([{ locationId: 'main', productId: 'pork', quantityPieces: 132 }, { locationId: 'main', productId: 'beef', quantityPieces: 5 }, { locationId: 'main', productId: 'shrimp', quantityPieces: 0 }]),
    getMovementHistory: vi.fn().mockResolvedValue([]), setOpeningStock: vi.fn(), recordReplenishment: vi.fn(), transferStock: vi.fn(), submitStockCount: vi.fn(),
    completeSale: vi.fn(), listSales: vi.fn(), voidSale: vi.fn(), getDashboard: vi.fn(), getSalesReport: vi.fn(), getMovementReport: vi.fn(), getValuationReport: vi.fn(), getProfitReport: vi.fn(), getDiscrepancyReport: vi.fn(), getLowStockReport: vi.fn(),
    chooseCsvImportFile: vi.fn(), previewCsvImport: vi.fn(), commitCsvImport: vi.fn(), exportReportCsv: vi.fn(), getSettings: vi.fn(), saveSettings: vi.fn(), chooseBackupDirectory: vi.fn(), createManualBackup: vi.fn(), chooseBackupFile: vi.fn(), restoreBackup: vi.fn(), requestRelaunch: vi.fn(),
    ...overrides,
  };
}

describe('inventory page', () => {
  it('labels populated movement records without changing their order or content', async () => {
    const note = 'MorningMarketDelivery'.repeat(12);
    const movements: StockMovement[] = [
      { id: 'newest', locationId: 'main', productId: 'pork', productName: 'Old pork label', quantityPieces: 12, movementType: 'replenishment', occurredAt: '2026-10-06 16:30:00', relatedEntityType: 'replenishment', relatedEntityId: 'receipt', note, unitCostCentavos: 14600, lineCostCentavos: 2655 },
      { id: 'older', locationId: 'main', productId: 'archived', productName: 'Archived garlic siomai', quantityPieces: -2, movementType: 'sale', occurredAt: '2026-10-06 15:00:00', relatedEntityType: 'sale', relatedEntityId: 'sale', note: null, unitCostCentavos: 100, lineCostCentavos: 200 },
    ];
    render(<InventoryPage api={makeApi({ getMovementHistory: vi.fn().mockResolvedValue(movements) })} />);
    const table = await screen.findByRole('table', { name: 'Recent stock movements' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    const newest = within(rows[0]);
    expect(newest.getByRole('cell', { name: 'Oct 7, 2026, 12:30 AM' })).toHaveAttribute('data-label', 'When');
    expect(newest.getByRole('cell', { name: 'Siomai Pork' })).toHaveAttribute('data-label', 'Product');
    expect(newest.getByRole('cell', { name: 'replenishment' })).toHaveAttribute('data-label', 'Movement');
    expect(newest.getByRole('cell', { name: '+12 pc' })).toHaveAttribute('data-label', 'Quantity');
    expect(newest.getByRole('cell', { name: note })).toHaveAttribute('data-label', 'Note');
    expect(within(rows[1]).getByRole('cell', { name: 'Archived garlic siomai' })).toHaveAttribute('data-label', 'Product');
    expect(within(rows[1]).getByRole('cell', { name: '-2 pc' })).toHaveAttribute('data-label', 'Quantity');
    expect(within(rows[1]).getByRole('cell', { name: '—' })).toHaveAttribute('data-label', 'Note');
    expect(within(table).getByRole('columnheader', { name: 'Quantity' })).toHaveAttribute('scope', 'col');
    expect(screen.queryByText('Old pork label')).not.toBeInTheDocument();
  });

  it('preserves the empty movement-history guidance', async () => {
    render(<InventoryPage api={makeApi()} />);
    expect(await screen.findByText('No stock movements at this location.')).toBeInTheDocument();
  });

  it('searches product names and SKUs and filters low stock with explicit healthy and zero labels', async () => {
    render(<InventoryPage api={makeApi()} />);
    const table = await screen.findByRole('table', { name: 'Inventory' });
    await screen.findByText('132 pc (2 packs)');
    expect(within(table).getByText('Siomai Pork')).toBeInTheDocument();
    expect(within(table).getByText('132 pc (2 packs)')).toBeInTheDocument();
    expect(within(table).getByText('₱292.00')).toBeInTheDocument();
    expect(within(table).getByText('Healthy')).toBeInTheDocument();
    expect(within(table).getAllByText('Low stock')).toHaveLength(2);
    expect(within(table).getByText('0 pc (0 packs)')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search inventory' }), { target: { value: 'BEEF-02' } });
    expect(within(table).getByText('Siomai Beef')).toBeInTheDocument();
    expect(within(table).queryByText('Siomai Pork')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search inventory' }), { target: { value: 'Siomai Pork' } });
    expect(within(table).getByText('Siomai Pork')).toBeInTheDocument();
    expect(within(table).queryByText('Siomai Beef')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search inventory' }), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Stock status'), { target: { value: 'low' } });
    expect(within(table).getByText('Siomai Beef')).toBeInTheDocument();
    expect(within(table).getByText('Siomai Shrimp')).toBeInTheDocument();
    expect(within(table).queryByText('Siomai Pork')).not.toBeInTheDocument();
  });

  it('navigates from the inventory header to replenishment and stock count', async () => {
    const onNavigate = vi.fn();
    render(<InventoryPage api={makeApi()} onNavigate={onNavigate} />);
    await screen.findByRole('table', { name: 'Inventory' });
    fireEvent.click(screen.getByRole('button', { name: 'Replenish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stock count' }));
    expect(onNavigate).toHaveBeenNthCalledWith(1, 'Replenish');
    expect(onNavigate).toHaveBeenNthCalledWith(2, 'Stock count');
  });

  it('rounds large stock value in centavos with exact integer arithmetic', async () => {
    const expensiveProduct: CatalogProduct = { ...products[0], piecesPerPack: 3, purchaseCostPerPackCentavos: Number.MAX_SAFE_INTEGER };
    const maxCentavoProduct: CatalogProduct = { ...expensiveProduct, id: 'max-centavo', sku: 'MAX-1', name: 'Max centavo', piecesPerPack: 1 };
    const api = makeApi({ listProducts: vi.fn().mockResolvedValue([expensiveProduct, maxCentavoProduct]), getBalances: vi.fn().mockResolvedValue([{ locationId: 'main', productId: 'pork', quantityPieces: 1 }, { locationId: 'main', productId: 'max-centavo', quantityPieces: 1 }]) });
    render(<InventoryPage api={api} />);
    expect(await screen.findByText('₱30,023,997,515,803.30')).toBeInTheDocument();
    expect(screen.getByText('₱90,071,992,547,409.91')).toBeInTheDocument();
  });
});
