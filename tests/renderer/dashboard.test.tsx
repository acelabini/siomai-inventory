// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventoryApi } from '../../src/shared/contracts';
import App from '../../src/renderer/App';
import DashboardPage from '../../src/renderer/pages/DashboardPage';
import ReportsPage from '../../src/renderer/pages/ReportsPage';

afterEach(cleanup);

function makeApi(overrides: Partial<InventoryApi> = {}): InventoryApi {
  return {
    getSetupState: vi.fn(), completeSetup: vi.fn(), listProducts: vi.fn().mockResolvedValue([]), saveProduct: vi.fn(), archiveProduct: vi.fn(),
    listLocations: vi.fn().mockResolvedValue([{ id: 'main', name: 'Main Cart', isActive: true }, { id: 'branch', name: 'Market Cart', isActive: true }]),
    saveLocation: vi.fn(), archiveLocation: vi.fn(), setOpeningStock: vi.fn(), recordReplenishment: vi.fn(), transferStock: vi.fn(), submitStockCount: vi.fn(),
    getBalances: vi.fn().mockResolvedValue([]), getMovementHistory: vi.fn().mockResolvedValue([]), completeSale: vi.fn(), listSales: vi.fn().mockResolvedValue([]), voidSale: vi.fn(),
    getDashboard: vi.fn().mockResolvedValue({ locationId: 'main', date: '2026-10-07', metrics: { revenueCentavos: 12500, costCentavos: 8000, grossProfitCentavos: 4500, stockValueCentavos: 82000, discrepancyCount: 2, lowStockCount: 1 }, products: [{ productId: 'pork', sku: 'PORK-01', productName: 'Siomai Pork', piecesPerPack: 66, openingPieces: 100, replenishedPieces: 66, soldPieces: 20, remainingPieces: 146, stockValueCentavos: 32200, lowStockThresholdPieces: 150, isLowStock: true }] }),
    getSalesReport: vi.fn().mockResolvedValue({ date: '2026-10-07', sales: [] }), getMovementReport: vi.fn().mockResolvedValue({ date: '2026-10-07', movements: [] }),
    getValuationReport: vi.fn().mockResolvedValue({ date: '2026-10-07', totalValueCentavos: 0, items: [] }), getProfitReport: vi.fn().mockResolvedValue({ date: '2026-10-07', revenueCentavos: 0, costCentavos: 0, grossProfitCentavos: 0 }),
    getDiscrepancyReport: vi.fn().mockResolvedValue({ date: '2026-10-07', count: 0, items: [] }), getLowStockReport: vi.fn().mockResolvedValue({ date: '2026-10-07', count: 0, items: [] }),
    ...overrides,
  };
}

describe('dashboard and reports', () => {
  it('loads default location and Manila date, then shows five metrics and the spreadsheet ledger table', async () => {
    const api = makeApi();
    render(<DashboardPage api={api} />);
    const location = await screen.findByLabelText(/location/i);
    expect((location as HTMLSelectElement).value).toBe('main');
    await waitFor(() => expect(api.getDashboard).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'main', date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })));
    expect(await screen.findByText('₱125.00')).toBeInTheDocument();
    expect(screen.getByText('Gross profit')).toBeInTheDocument();
    expect(screen.getByText('Stock value')).toBeInTheDocument();
    expect(screen.getByText('Discrepancies')).toBeInTheDocument();
    expect(screen.getByText('Low stock')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /daily inventory ledger/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /opening/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /siomai pork/i })).toHaveTextContent('146');
    expect(screen.getByLabelText(/low stock/i)).toHaveTextContent('⚠ Low stock');
  });

  it('offers useful actions when there are no inventory rows', async () => {
    const api = makeApi({ getDashboard: vi.fn().mockResolvedValue({ locationId: 'main', date: '2026-10-07', metrics: { revenueCentavos: 0, costCentavos: 0, grossProfitCentavos: 0, stockValueCentavos: 0, discrepancyCount: 0, lowStockCount: 0 }, products: [] }) });
    render(<DashboardPage api={api} onNavigate={vi.fn()} />);
    expect(await screen.findByText(/no stock recorded/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /record opening stock/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add products/i })).toBeInTheDocument();
  });

  it('refreshes reports when filters change and invokes the print command', async () => {
    const print = vi.fn();
    Object.defineProperty(window, 'print', { configurable: true, value: print });
    const api = makeApi();
    render(<ReportsPage api={api} />);
    const date = await screen.findByLabelText(/report date/i);
    fireEvent.change(screen.getByLabelText(/location/i), { target: { value: 'branch' } });
    fireEvent.change(date, { target: { value: '2026-10-06' } });
    await waitFor(() => expect(api.getProfitReport).toHaveBeenLastCalledWith({ locationId: 'branch', date: '2026-10-06' }));
    fireEvent.click(screen.getByRole('button', { name: /print report/i }));
    expect(print).toHaveBeenCalledOnce();
  });

  it('keeps shared location and Manila date context across navigation and page filters', async () => {
    const api = makeApi({ getSetupState: vi.fn().mockResolvedValue({ complete: true, businessName: 'Cart ni Ate', locations: [], sampleProducts: [] }) });
    render(<App api={api} />);
    const globalLocation = await screen.findByLabelText(/current location/i) as HTMLSelectElement;
    const globalDate = screen.getByLabelText(/global business date/i);
    await waitFor(() => expect(globalLocation.value).toBe('main'));
    fireEvent.change(globalLocation, { target: { value: 'branch' } });
    fireEvent.change(globalDate, { target: { value: '2026-10-06' } });
    await waitFor(() => expect(api.getDashboard).toHaveBeenLastCalledWith({ locationId: 'branch', date: '2026-10-06' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reports' }));
    await waitFor(() => expect(api.getProfitReport).toHaveBeenLastCalledWith({ locationId: 'branch', date: '2026-10-06' }));
    fireEvent.change(screen.getByLabelText(/report location/i), { target: { value: 'main' } });
    expect(globalLocation.value).toBe('main');
    expect((globalDate as HTMLInputElement).value).toBe('2026-10-06');
    expect(screen.getByRole('complementary', { name: /main navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    await waitFor(() => expect(api.getDashboard).toHaveBeenLastCalledWith({ locationId: 'main', date: '2026-10-06' }));
  });

  it('shows valuation, discrepancy, and low-stock detail rows in reports', async () => {
    const api = makeApi({
      getValuationReport: vi.fn().mockResolvedValue({ date: '2026-10-07', totalValueCentavos: 2500, items: [{ locationId: 'main', productId: 'pork', productName: 'Siomai Pork', quantityPieces: 25, valueCentavos: 2500 }] }),
      getDiscrepancyReport: vi.fn().mockResolvedValue({ date: '2026-10-07', count: 1, items: [{ locationId: 'main', productId: 'pork', productName: 'Siomai Pork', expectedPieces: 28, countedPieces: 25, differencePieces: -3, countedAt: '2026-10-06 18:00:00' }] }),
      getLowStockReport: vi.fn().mockResolvedValue({ date: '2026-10-07', count: 1, items: [{ locationId: 'main', productId: 'pork', productName: 'Siomai Pork', quantityPieces: 3, lowStockThresholdPieces: 10 }] }),
    });
    render(<ReportsPage api={api} />);
    expect(await screen.findByRole('table', { name: /stock valuation details/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /siomai pork.*25.*₱25.00/i })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /stock count discrepancies/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /siomai pork.*28.*25.*-3/i })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /low stock details/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /siomai pork.*3.*10/i })).toBeInTheDocument();
    expect(screen.getByText(/current product purchase cost/i)).toBeInTheDocument();
  });

  it('uses the app active location across sales and every location-aware stock workflow', async () => {
    const api = makeApi({
      getSetupState: vi.fn().mockResolvedValue({ complete: true, businessName: 'Cart ni Ate', locations: [], sampleProducts: [] }),
      getBalances: vi.fn().mockResolvedValue([]),
    });
    render(<App api={api} />);
    const globalLocation = await screen.findByLabelText(/current location/i) as HTMLSelectElement;
    await waitFor(() => expect(globalLocation.value).toBe('main'));
    fireEvent.change(globalLocation, { target: { value: 'branch' } });

    for (const workflow of ['Sales', 'Inventory', 'Replenish', 'Transfers', 'Stock count']) {
      const callCount = (api.getBalances as ReturnType<typeof vi.fn>).mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: workflow }));
      await waitFor(() => expect(api.getBalances).toHaveBeenCalledTimes(callCount + 1));
      expect(api.getBalances).toHaveBeenLastCalledWith('branch');
    }

    fireEvent.click(screen.getByRole('button', { name: 'Transfers' }));
    fireEvent.change(await screen.findByLabelText(/source location/i), { target: { value: 'main' } });
    expect(globalLocation.value).toBe('main');
    await waitFor(() => expect(api.getBalances).toHaveBeenLastCalledWith('main'));
  });
});
