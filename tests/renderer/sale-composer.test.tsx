// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventoryApi } from '../../src/shared/contracts';
import type { CatalogLocation, CatalogProduct, SaleReceipt } from '../../src/shared/schemas';
import SaleComposer from '../../src/renderer/components/SaleComposer';
import SaleReceiptView from '../../src/renderer/components/SaleReceipt';

afterEach(cleanup);

const pork: CatalogProduct = { id: 'pork', sku: 'PORK', name: 'Siomai Pork', piecesPerPack: 10, purchaseCostPerPackCentavos: 1000, sellingPricePerPieceCentavos: 300, sellingPricePerPackCentavos: 2500, lowStockThresholdPieces: 2, isActive: true };
const beef: CatalogProduct = { ...pork, id: 'beef', sku: 'BEEF', name: 'Siomai Beef', piecesPerPack: 6, sellingPricePerPieceCentavos: 275, sellingPricePerPackCentavos: 1500 };
const main: CatalogLocation = { id: 'main', name: 'Main Cart', isActive: true };

function makeApi(overrides: Partial<InventoryApi> = {}): InventoryApi {
  return {
    getSetupState: vi.fn(), completeSetup: vi.fn(), listProducts: vi.fn().mockResolvedValue([pork, beef]), saveProduct: vi.fn(), archiveProduct: vi.fn(),
    listLocations: vi.fn().mockResolvedValue([main]), saveLocation: vi.fn(), archiveLocation: vi.fn(), setOpeningStock: vi.fn(), recordReplenishment: vi.fn(),
    transferStock: vi.fn(), submitStockCount: vi.fn(), getBalances: vi.fn().mockResolvedValue([{ locationId: 'main', productId: 'pork', quantityPieces: 25 }, { locationId: 'main', productId: 'beef', quantityPieces: 6 }]),
    getMovementHistory: vi.fn(), completeSale: vi.fn().mockResolvedValue({ id: 'sale-1', locationId: 'main', businessAt: '2026-10-06 12:00:00', totalCentavos: 600, paymentCentavos: 1000, changeCentavos: 400, status: 'completed', note: null, lines: [{ productId: 'pork', productName: 'Siomai Pork', quantityPieces: 2, enteredUnit: 'piece', enteredQuantity: '2', unitSellingPriceCentavos: 300, unitCostCentavos: 1000, lineRevenueCentavos: 600, lineCostCentavos: 200, balancePieces: 23 }] }),
    listSales: vi.fn(), voidSale: vi.fn(), getDashboard: vi.fn(), getSalesReport: vi.fn(), getMovementReport: vi.fn(), getValuationReport: vi.fn(), getProfitReport: vi.fn(), getDiscrepancyReport: vi.fn(), getLowStockReport: vi.fn(),
    chooseCsvImportFile: vi.fn().mockResolvedValue(null), previewCsvImport: vi.fn(), commitCsvImport: vi.fn(), exportReportCsv: vi.fn().mockResolvedValue(false),
    getSettings: vi.fn().mockResolvedValue({ businessName: 'Cart', backupDirectory: '/backups' }), saveSettings: vi.fn().mockResolvedValue({ businessName: 'Cart' }),
    chooseBackupDirectory: vi.fn().mockResolvedValue(null), createManualBackup: vi.fn().mockResolvedValue({ fileName: 'manual.sqlite' }),
    chooseBackupFile: vi.fn().mockResolvedValue(null), restoreBackup: vi.fn(), requestRelaunch: vi.fn(),
    ...overrides,
  };
}

async function waitForAvailability(quantity: string) {
  await screen.findByText((_, element) => element?.tagName === 'P' && element.textContent?.includes(quantity) === true);
}

describe('sale composer', () => {
  it('searches products, adds a line, switches units and shows available stock and line total', async () => {
    render(<SaleComposer api={makeApi()} />);
    const search = await screen.findByLabelText(/find a product/i);
    fireEvent.change(search, { target: { value: 'pork' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siomai Pork PORK' }));
    await waitForAvailability('25 pc');
    fireEvent.change(screen.getByLabelText(/quantity for siomai pork/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/unit for siomai pork/i), { target: { value: 'pack' } });
    expect(screen.getByText(/available: 25 pc/i)).toBeInTheDocument();
    expect(screen.getAllByText('₱25.00')).toHaveLength(2);
  });

  it('keeps separate source entries when one product is added in pack and piece units', async () => {
    const api = makeApi();
    render(<SaleComposer api={api} />);
    const search = await screen.findByLabelText(/find a product/i);
    fireEvent.change(search, { target: { value: 'pork' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siomai Pork PORK' }));
    await waitForAvailability('25 pc');
    fireEvent.change(screen.getByLabelText(/quantity for siomai pork/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/unit for siomai pork/i), { target: { value: 'pack' } });
    fireEvent.change(search, { target: { value: 'pork' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siomai Pork PORK' }));
    const quantities = await screen.findAllByLabelText(/quantity for siomai pork/i);
    expect(quantities).toHaveLength(2);
    fireEvent.change(quantities[1], { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Amount tendered'), { target: { value: '34' } });
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }));
    await waitFor(() => expect(api.completeSale).toHaveBeenCalledWith({ locationId: 'main', paymentCentavos: 3400, note: undefined, lines: [
      { productId: 'pork', quantity: 1, unit: 'pack' },
      { productId: 'pork', quantity: 3, unit: 'piece' },
    ] }));
  });

  it('removes lines and computes payment change before completing the sale', async () => {
    const api = makeApi();
    render(<SaleComposer api={api} />);
    fireEvent.change(await screen.findByLabelText(/find a product/i), { target: { value: 'beef' } });
    fireEvent.click(screen.getByRole('button', { name: /siomai beef/i }));
    await waitForAvailability('6 pc');
    fireEvent.change(screen.getByLabelText(/quantity for siomai beef/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/amount tendered/i), { target: { value: '10' } });
    expect(screen.getAllByText('₱5.50')).toHaveLength(2);
    expect(screen.getByText('₱4.50')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /remove siomai beef/i }));
    expect(screen.queryByLabelText(/quantity for siomai beef/i)).not.toBeInTheDocument();
  });

  it('disables completion while empty, underfunded or above availability', async () => {
    render(<SaleComposer api={makeApi()} />);
    const complete = await screen.findByRole('button', { name: /complete sale/i });
    expect(complete).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/find a product/i), { target: { value: 'pork' } });
    fireEvent.click(screen.getByRole('button', { name: /siomai pork/i }));
    await waitForAvailability('25 pc');
    fireEvent.change(screen.getByLabelText(/quantity for siomai pork/i), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/amount tendered/i), { target: { value: '1' } });
    expect(complete).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/amount tendered/i), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/quantity for siomai pork/i), { target: { value: '26' } });
    expect(complete).toBeDisabled();
  });

  it('preserves entered values and displays recoverable API errors', async () => {
    const api = makeApi({ completeSale: vi.fn().mockRejectedValue(new Error('The balance changed.')) });
    render(<SaleComposer api={api} />);
    fireEvent.change(await screen.findByLabelText(/find a product/i), { target: { value: 'pork' } });
    fireEvent.click(screen.getByRole('button', { name: /siomai pork/i }));
    await waitForAvailability('25 pc');
    fireEvent.change(screen.getByLabelText(/quantity for siomai pork/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/amount tendered/i), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The balance changed.');
    expect((screen.getByLabelText(/quantity for siomai pork/i) as HTMLInputElement).value).toBe('2');
  });

  it('shows the completed receipt and requires an explicit void confirmation', async () => {
    const receipt: SaleReceipt = { id: 'sale-1', locationId: 'main', businessAt: '2026-10-06 12:00:00', totalCentavos: 600, paymentCentavos: 1000, changeCentavos: 400, status: 'completed', note: null, lines: [{ productId: 'pork', productName: 'Siomai Pork', quantityPieces: 2, enteredUnit: 'piece', enteredQuantity: '2', unitSellingPriceCentavos: 300, unitCostCentavos: 1000, lineRevenueCentavos: 600, lineCostCentavos: 200, balancePieces: 23 }] };
    const onVoid = vi.fn();
    render(<SaleReceiptView receipt={receipt} onVoid={onVoid} />);
    expect(screen.getAllByText('₱6.00')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /void sale/i }));
    expect(onVoid).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Entered twice' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm void/i }));
    await waitFor(() => expect(onVoid).toHaveBeenCalledWith('Entered twice'));
  });
});
