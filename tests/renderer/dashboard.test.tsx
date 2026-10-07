// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { InventoryApi } from '../../src/shared/contracts';
import type { SaleSummary, StockMovement } from '../../src/shared/schemas';
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
    chooseCsvImportFile: vi.fn().mockResolvedValue(null), previewCsvImport: vi.fn(), commitCsvImport: vi.fn(), exportReportCsv: vi.fn().mockResolvedValue(false),
    getSettings: vi.fn().mockResolvedValue({ businessName: 'Cart', backupDirectory: '/backups' }), saveSettings: vi.fn().mockResolvedValue({ businessName: 'Cart' }),
    chooseBackupDirectory: vi.fn().mockResolvedValue(null), createManualBackup: vi.fn().mockResolvedValue({ fileName: 'manual.sqlite' }),
    chooseBackupFile: vi.fn().mockResolvedValue(null), restoreBackup: vi.fn(), requestRelaunch: vi.fn(),
    ...overrides,
  };
}

describe('dashboard and reports', () => {
  it('shows four daily metrics and one actionable stock attention notice', async () => {
    const api = makeApi();
    render(<DashboardPage api={api} />);
    const location = await screen.findByLabelText(/location/i);
    expect((location as HTMLSelectElement).value).toBe('main');
    await waitFor(() => expect(api.getDashboard).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'main', date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })));
    expect(await screen.findByText('₱125.00')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Today at a glance' })).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Daily summary' });
    expect(within(summary).getAllByRole('article')).toHaveLength(4);
    expect(within(summary).getByRole('article', { name: 'Sales' })).toHaveTextContent('₱125.00');
    expect(within(summary).getByRole('article', { name: 'Gross profit' })).toHaveTextContent('₱45.00');
    expect(within(summary).getByRole('article', { name: 'Items sold' })).toHaveTextContent('20 pc');
    expect(within(summary).getByRole('article', { name: 'Stock value' })).toHaveTextContent('₱820.00');
    const notice = screen.getByRole('status', { name: '' });
    expect(notice).toHaveTextContent('1 low-stock product');
    expect(notice).toHaveTextContent('2 discrepancies');
    expect(within(notice).getByRole('button', { name: 'View low stock' })).toBeInTheDocument();
    expect(within(notice).getByRole('button', { name: 'Review discrepancies' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /daily inventory ledger/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /daily activity summary/i })).toHaveTextContent(/not a full stock reconciliation/i);
    expect(screen.getByRole('columnheader', { name: /opening/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /siomai pork/i })).toHaveTextContent('146');
    expect(within(screen.getByRole('row', { name: /siomai pork/i })).getByText('Low stock')).toBeInTheDocument();
  });

  it('routes the stock attention actions to inventory and stock count', async () => {
    const onNavigate = vi.fn();
    render(<DashboardPage api={makeApi()} onNavigate={onNavigate} />);
    fireEvent.click(await screen.findByRole('button', { name: 'View low stock' }));
    expect(onNavigate).toHaveBeenLastCalledWith('Inventory');
    fireEvent.click(screen.getByRole('button', { name: 'Review discrepancies' }));
    expect(onNavigate).toHaveBeenLastCalledWith('Stock count');
  });

  it('shows zero stock checks without warning treatment', async () => {
    const api = makeApi({ getDashboard: vi.fn().mockResolvedValue({ locationId: 'main', date: '2026-10-07', metrics: { revenueCentavos: 0, costCentavos: 0, grossProfitCentavos: 0, stockValueCentavos: 0, discrepancyCount: 0, lowStockCount: 0 }, products: [] }) });
    render(<DashboardPage api={api} />);
    const checks = await screen.findByRole('region', { name: 'Stock checks' });
    expect(checks).toHaveTextContent('Low stock0');
    expect(checks).toHaveTextContent('Discrepancies0');
    expect(checks).toHaveTextContent('All clear');
    expect(checks.querySelector('.status-badge-warning, .status-badge-danger')).toBeNull();
    expect(screen.queryByText('Stock needs attention')).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Items sold' })).toHaveTextContent('0 pc');
  });

  it('merges the four newest sales and stock movements and displays Manila time', async () => {
    const sale = (id: string, businessAt: string, totalCentavos: number): SaleSummary => ({ id, locationId: 'main', businessAt, totalCentavos, paymentCentavos: totalCentavos, changeCentavos: 0, status: 'completed', note: null, lines: [] });
    const movement = (id: string, occurredAt: string, productName: string): StockMovement => ({ id, locationId: 'main', productId: id, productName, quantityPieces: 66, movementType: 'replenishment', occurredAt, relatedEntityType: 'replenishment', relatedEntityId: id, note: null, unitCostCentavos: 100, lineCostCentavos: 6600 });
    const api = makeApi({
      listSales: vi.fn().mockResolvedValue([sale('old-sale', '2026-10-06 14:00:00', 100), sale('new-sale', '2026-10-06 16:30:00', 12500), sale('mid-sale', '2026-10-06 15:40:00', 2500)]),
      getMovementHistory: vi.fn().mockResolvedValue([movement('mid-movement', '2026-10-06 16:10:00', 'Pork'), movement('new-movement', '2026-10-06 16:50:00', 'Beef'), movement('old-movement', '2026-10-06 13:00:00', 'Chicken')]),
    });
    render(<DashboardPage api={api} />);
    const activity = await screen.findByRole('list', { name: 'Recent activity' });
    const entries = within(activity).getAllByRole('listitem');
    expect(entries).toHaveLength(4);
    expect(entries[0]).toHaveTextContent('Beef');
    expect(entries[1]).toHaveTextContent('₱125.00');
    expect(entries[2]).toHaveTextContent('Pork');
    expect(entries[3]).toHaveTextContent('₱25.00');
    expect(entries[0].querySelector('time')).toHaveAttribute('dateTime', '2026-10-06T16:50:00Z');
    expect(entries[0].querySelector('time')).toHaveTextContent(/10\/7\/2026.*12:50.*AM/i);
    expect(within(activity).queryByText(/Chicken/)).not.toBeInTheDocument();
    expect(api.listSales).toHaveBeenCalledWith({ locationId: 'main', limit: 4 });
    expect(api.getMovementHistory).toHaveBeenCalledWith({ locationId: 'main', limit: 4 });
  });

  it('keeps recent activity labels in sentence case without CSS capitalization', async () => {
    const style = document.createElement('style');
    style.textContent = readFileSync('src/renderer/styles.css', 'utf8');
    document.head.append(style);
    try {
      const sale: SaleSummary = { id: 'completed', locationId: 'main', businessAt: '2026-10-06 16:30:00', totalCentavos: 12500, paymentCentavos: 12500, changeCentavos: 0, status: 'completed', note: null, lines: [] };
      const movement: StockMovement = { id: 'transfer', locationId: 'main', productId: 'pork', productName: 'Pork', quantityPieces: 10, movementType: 'transfer_in', occurredAt: '2026-10-06 16:10:00', relatedEntityType: 'transfer', relatedEntityId: 'transfer', note: null, unitCostCentavos: null, lineCostCentavos: null };
      render(<DashboardPage api={makeApi({
        listSales: vi.fn().mockResolvedValue([sale, { ...sale, id: 'voided', status: 'voided', businessAt: '2026-10-06 16:20:00' }]),
        getMovementHistory: vi.fn().mockResolvedValue([movement, { ...movement, id: 'count', movementType: 'count_adjustment', occurredAt: '2026-10-06 16:00:00' }]),
      })} />);
      const activity = await screen.findByRole('list', { name: 'Recent activity' });
      const titles = within(activity).getAllByRole('listitem').map((entry) => entry.querySelector('.activity-title')!);
      expect.soft(titles.map((title) => title.textContent)).toEqual(['Completed sale', 'Voided sale', 'Transfer in', 'Count adjustment']);
      for (const title of titles) expect.soft(['', 'none']).toContain(getComputedStyle(title).textTransform);
    } finally {
      style.remove();
    }
  });

  it('offers useful actions when there are no inventory rows', async () => {
    const api = makeApi({ getDashboard: vi.fn().mockResolvedValue({ locationId: 'main', date: '2026-10-07', metrics: { revenueCentavos: 0, costCentavos: 0, grossProfitCentavos: 0, stockValueCentavos: 0, discrepancyCount: 0, lowStockCount: 0 }, products: [] }) });
    const onNavigate = vi.fn();
    render(<DashboardPage api={api} onNavigate={onNavigate} />);
    expect(await screen.findByText(/no stock recorded/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reconcile stock count/i }));
    expect(onNavigate).toHaveBeenCalledWith('Stock count');
    expect(screen.getByRole('button', { name: /add products/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add products/i }));
    expect(onNavigate).toHaveBeenLastCalledWith('Products');
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
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    await waitFor(() => expect(api.getDashboard).toHaveBeenLastCalledWith({ locationId: 'main', date: '2026-10-06' }));
  });

  it('finishes first-run business and location setup before opening the import page', async () => {
    const api = makeApi({
      getSetupState: vi.fn().mockResolvedValue({ complete: false, businessName: null, locations: [], sampleProducts: [] }),
      completeSetup: vi.fn().mockResolvedValue({ complete: true, businessName: 'Cart', locationId: 'main' }),
    });
    render(<App api={api} />);
    await screen.findByRole('heading', { name: /set up your business/i });
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: 'Cart' } });
    fireEvent.change(screen.getByLabelText(/location name/i), { target: { value: 'Main Cart' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(await screen.findByRole('radio', { name: /import products or stock from csv/i }));
    fireEvent.click(screen.getByRole('button', { name: /complete setup and import csv/i }));
    expect(await screen.findByRole('heading', { name: 'Import data' })).toBeInTheDocument();
    expect(api.completeSetup).toHaveBeenCalledWith({ businessName: 'Cart', locationName: 'Main Cart', sampleProductIds: [], openingStock: [] });
  });

  it('focuses the selected report and exports that kind with the active filters', async () => {
    const api = makeApi({
      getValuationReport: vi.fn().mockResolvedValue({ date: '2026-10-07', totalValueCentavos: 999999999, items: [{ locationId: 'main', productId: 'pork', productName: 'Siomai Pork', quantityPieces: 25, valueCentavos: 999999999 }] }),
      getDiscrepancyReport: vi.fn().mockResolvedValue({ date: '2026-10-07', count: 3, items: [{ locationId: 'main', productId: 'pork', productName: 'Siomai Pork', expectedPieces: 27, countedPieces: 25, differencePieces: -2, countedAt: '2026-10-06 18:00:00' }, { locationId: 'main', productId: 'beef', productName: 'Beef', expectedPieces: 5, countedPieces: 8, differencePieces: 3, countedAt: '2026-10-06 18:00:00' }, { locationId: 'main', productId: 'chicken', productName: 'Chicken', expectedPieces: 0, countedPieces: 0, differencePieces: 0, countedAt: '2026-10-06 18:00:00' }] }),
      getLowStockReport: vi.fn().mockResolvedValue({ date: '2026-10-07', count: 1, items: [{ locationId: 'main', productId: 'pork', productName: 'Siomai Pork', quantityPieces: 3, lowStockThresholdPieces: 10 }] }),
      exportReportCsv: vi.fn().mockResolvedValue(true),
    });
    render(<ReportsPage api={api} />);
    await screen.findByRole('region', { name: 'Report summary' });
    const selector = screen.getByLabelText('Report type');
    fireEvent.change(selector, { target: { value: 'valuation' } });
    expect(screen.getByRole('table', { name: /stock valuation details/i })).toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(screen.getByRole('row', { name: /siomai pork.*25.*₱9,999,999.99/i })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /sales report/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Revenue' })).not.toBeInTheDocument();
    expect(screen.getByText(/current product purchase cost/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Report location'), { target: { value: 'branch' } });
    fireEvent.change(screen.getByLabelText('Report date'), { target: { value: '2026-10-06' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(api.exportReportCsv).toHaveBeenLastCalledWith('valuation', { locationId: 'branch', date: '2026-10-06' }));
    expect(await screen.findByText('CSV export saved.')).toBeInTheDocument();
    fireEvent.change(selector, { target: { value: 'discrepancies' } });
    expect(screen.getByRole('table', { name: /stock count discrepancies/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /siomai pork.*27.*25.*−2 pc/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /beef.*5.*8.*\+3 pc/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /chicken.*0.*0.*0 pc/i })).toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(screen.queryByText(/current product purchase cost/i)).not.toBeInTheDocument();
    fireEvent.change(selector, { target: { value: 'low-stock' } });
    expect(screen.getByRole('table', { name: /low stock details/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /siomai pork.*3.*10/i })).toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(1);
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
      fireEvent.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: workflow === 'Sales' ? 'New sale' : workflow }));
      await waitFor(() => expect(api.getBalances).toHaveBeenCalledTimes(callCount + 1));
      expect(api.getBalances).toHaveBeenLastCalledWith('branch');
    }

    fireEvent.click(screen.getByRole('button', { name: 'Transfers' }));
    fireEvent.change(await screen.findByLabelText(/source location/i), { target: { value: 'main' } });
    expect(globalLocation.value).toBe('main');
    await waitFor(() => expect(api.getBalances).toHaveBeenLastCalledWith('main'));
  });
});
