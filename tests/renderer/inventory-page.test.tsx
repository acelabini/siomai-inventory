// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventoryApi } from '../../src/shared/contracts';
import type { CatalogLocation, CatalogProduct } from '../../src/shared/schemas';
import InventoryPage from '../../src/renderer/pages/InventoryPage';

afterEach(cleanup);

const location: CatalogLocation = { id: 'main', name: 'Main Cart', isActive: true };
const products: CatalogProduct[] = [
  { id: 'pork', sku: 'PORK-01', name: 'Siomai Pork', piecesPerPack: 66, purchaseCostPerPackCentavos: 14600, sellingPricePerPieceCentavos: 300, sellingPricePerPackCentavos: 19000, lowStockThresholdPieces: 10, isActive: true },
  { id: 'beef', sku: 'BEEF-02', name: 'Siomai Beef', piecesPerPack: 60, purchaseCostPerPackCentavos: 12000, sellingPricePerPieceCentavos: 300, sellingPricePerPackCentavos: 17000, lowStockThresholdPieces: 10, isActive: true },
  { id: 'shrimp', sku: 'SHRIMP-03', name: 'Siomai Shrimp', piecesPerPack: 50, purchaseCostPerPackCentavos: 10000, sellingPricePerPieceCentavos: 350, sellingPricePerPackCentavos: 16000, lowStockThresholdPieces: 10, isActive: true },
];

function makeApi(): InventoryApi {
  return {
    getSetupState: vi.fn(), completeSetup: vi.fn(), listProducts: vi.fn().mockResolvedValue(products), saveProduct: vi.fn(), archiveProduct: vi.fn(),
    listLocations: vi.fn().mockResolvedValue([location]), saveLocation: vi.fn(), archiveLocation: vi.fn(),
    getBalances: vi.fn().mockResolvedValue([{ locationId: 'main', productId: 'pork', quantityPieces: 132 }, { locationId: 'main', productId: 'beef', quantityPieces: 5 }, { locationId: 'main', productId: 'shrimp', quantityPieces: 0 }]),
    getMovementHistory: vi.fn().mockResolvedValue([]), setOpeningStock: vi.fn(), recordReplenishment: vi.fn(), transferStock: vi.fn(), submitStockCount: vi.fn(),
    completeSale: vi.fn(), listSales: vi.fn(), voidSale: vi.fn(), getDashboard: vi.fn(), getSalesReport: vi.fn(), getMovementReport: vi.fn(), getValuationReport: vi.fn(), getProfitReport: vi.fn(), getDiscrepancyReport: vi.fn(), getLowStockReport: vi.fn(),
    chooseCsvImportFile: vi.fn(), previewCsvImport: vi.fn(), commitCsvImport: vi.fn(), exportReportCsv: vi.fn(), getSettings: vi.fn(), saveSettings: vi.fn(), chooseBackupDirectory: vi.fn(), createManualBackup: vi.fn(), chooseBackupFile: vi.fn(), restoreBackup: vi.fn(), requestRelaunch: vi.fn(),
  };
}

describe('inventory page', () => {
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
});
