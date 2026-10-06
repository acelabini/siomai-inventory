// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventoryApi } from '../../src/shared/contracts';
import type { CatalogLocation, CatalogProduct } from '../../src/shared/schemas';
import InventoryPage from '../../src/renderer/pages/InventoryPage';
import ReplenishPage from '../../src/renderer/pages/ReplenishPage';
import TransfersPage from '../../src/renderer/pages/TransfersPage';
import StockCountPage from '../../src/renderer/pages/StockCountPage';

afterEach(cleanup);

const pork: CatalogProduct = { id: 'pork', sku: 'PORK', name: 'Siomai Pork', piecesPerPack: 66, purchaseCostPerPackCentavos: 14600, sellingPricePerPieceCentavos: 300, sellingPricePerPackCentavos: 19000, lowStockThresholdPieces: 10, isActive: true };
const beef: CatalogProduct = { ...pork, id: 'beef', sku: 'BEEF', name: 'Siomai Beef', piecesPerPack: 60, purchaseCostPerPackCentavos: 14000 };
const main: CatalogLocation = { id: 'main', name: 'Main Cart', isActive: true };
const branch: CatalogLocation = { id: 'branch', name: 'Market Cart', isActive: true };

function makeApi(overrides: Partial<InventoryApi> = {}): InventoryApi {
  return {
    getSetupState: vi.fn(), completeSetup: vi.fn(), listProducts: vi.fn().mockResolvedValue([pork, beef]),
    saveProduct: vi.fn(), archiveProduct: vi.fn(), listLocations: vi.fn().mockResolvedValue([main, branch]),
    saveLocation: vi.fn(), archiveLocation: vi.fn(),
    getBalances: vi.fn().mockResolvedValue([{ locationId: 'main', productId: 'pork', quantityPieces: 132 }]),
    getMovementHistory: vi.fn().mockResolvedValue([]), setOpeningStock: vi.fn(),
    recordReplenishment: vi.fn().mockResolvedValue({ id: 'receipt-1', lines: [] }),
    transferStock: vi.fn().mockResolvedValue({ id: 'transfer-1', lines: [] }),
    submitStockCount: vi.fn().mockResolvedValue({ id: 'count-1', lines: [] }),
    completeSale: vi.fn(), listSales: vi.fn().mockResolvedValue([]), voidSale: vi.fn(),
    getDashboard: vi.fn(), getSalesReport: vi.fn(), getMovementReport: vi.fn(), getValuationReport: vi.fn(), getProfitReport: vi.fn(), getDiscrepancyReport: vi.fn(), getLowStockReport: vi.fn(),
    chooseCsvImportFile: vi.fn().mockResolvedValue(null), previewCsvImport: vi.fn(), commitCsvImport: vi.fn(), exportReportCsv: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

describe('stock workflow pages', () => {
  it('shows the location availability in pack and piece units', async () => {
    render(<InventoryPage api={makeApi()} />);
    expect(await screen.findByRole('cell', { name: '132 pc (2 packs)' })).toBeInTheDocument();
  });

  it('converts UTC movement timestamps to Manila local time', async () => {
    const api = makeApi({ getMovementHistory: vi.fn().mockResolvedValue([{
      id: 'movement-1', locationId: 'main', productId: 'pork', productName: 'Siomai Pork',
      quantityPieces: 10, movementType: 'replenishment', occurredAt: '2026-10-06 16:30:00',
      relatedEntityType: 'replenishment', relatedEntityId: 'receipt-1', note: null,
      unitCostCentavos: 14600, lineCostCentavos: 2212,
    }]) });
    render(<InventoryPage api={api} />);
    expect(await screen.findByText('Oct 7, 2026, 12:30 AM')).toBeInTheDocument();
  });

  it('switches replenishment units, previews pieces and total cost, then resets after success', async () => {
    const api = makeApi();
    render(<ReplenishPage api={api} />);
    await screen.findByRole('option', { name: 'Main Cart' });
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '1.5' } });
    fireEvent.change(screen.getByLabelText(/unit/i), { target: { value: 'pack' } });
    expect(screen.getByText(/99 pieces/i)).toBeInTheDocument();
    expect(screen.getByText('₱219.00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /record replenishment/i }));
    await waitFor(() => expect(api.recordReplenishment).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'main', lines: [{ productId: 'pork', quantity: 1.5, unit: 'pack' }] })));
    expect((screen.getByLabelText(/quantity/i) as HTMLInputElement).value).toBe('');
  });

  it('requires distinct source and destination for a transfer', async () => {
    const api = makeApi();
    render(<TransfersPage api={api} />);
    await screen.findByLabelText(/destination location/i);
    fireEvent.change(screen.getByLabelText(/destination/i), { target: { value: 'main' } });
    expect(screen.getByText(/choose a different destination/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /transfer stock/i })).toBeDisabled();
  });

  it('shows count differences, requires a reason, and resets after successful submission', async () => {
    const api = makeApi({ getBalances: vi.fn().mockResolvedValue([{ locationId: 'main', productId: 'pork', quantityPieces: 66 }]) });
    render(<StockCountPage api={api} />);
    await screen.findByRole('option', { name: 'Main Cart' });
    fireEvent.change(screen.getByLabelText(/counted quantity/i), { target: { value: '60' } });
    expect(screen.getByText(/difference: -6 pc/i)).toBeInTheDocument();
    expect(screen.getByText(/reason is required/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Damaged' } });
    fireEvent.click(screen.getByRole('button', { name: /submit stock count/i }));
    await waitFor(() => expect(api.submitStockCount).toHaveBeenCalledWith(expect.objectContaining({ lines: [{ productId: 'pork', countedQuantity: 60, unit: 'piece', reason: 'Damaged' }] })));
    expect((screen.getByLabelText(/counted quantity/i) as HTMLInputElement).value).toBe('');
  });
});
