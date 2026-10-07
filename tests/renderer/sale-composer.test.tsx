// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventoryApi } from '../../src/shared/contracts';
import type { CatalogLocation, CatalogProduct, InventoryBalance, SaleReceipt } from '../../src/shared/schemas';
import SaleComposer from '../../src/renderer/components/SaleComposer';
import SaleReceiptView from '../../src/renderer/components/SaleReceipt';
import SalesPage from '../../src/renderer/pages/SalesPage';

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
    fireEvent.click(screen.getByRole('button', { name: /add siomai pork/i }));
    await waitForAvailability('25 pc');
    fireEvent.change(screen.getByLabelText(/quantity for siomai pork/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/unit for siomai pork/i), { target: { value: 'pack' } });
    expect(screen.getByText(/available: 25 pc/i)).toBeInTheDocument();
    expect(screen.getAllByText('₱25.00')).toHaveLength(2);
  });

  it('rounds fractional pack previews with the same exact centavo arithmetic as checkout', async () => {
    const product = { ...pork, piecesPerPack: 100, sellingPricePerPackCentavos: 50 };
    const api = makeApi({ listProducts: vi.fn().mockResolvedValue([product]), getBalances: vi.fn().mockResolvedValue([{ locationId: 'main', productId: 'pork', quantityPieces: 100 }]) });
    render(<SaleComposer api={api} />);
    fireEvent.change(await screen.findByLabelText(/find a product/i), { target: { value: 'pork' } });
    fireEvent.click(screen.getByRole('button', { name: /add siomai pork/i }));
    await waitForAvailability('1 pack');
    fireEvent.change(screen.getByLabelText(/unit for siomai pork/i), { target: { value: 'pack' } });
    fireEvent.change(screen.getByLabelText(/quantity for siomai pork/i), { target: { value: '0.29' } });
    expect(screen.getAllByText('₱0.15')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Amount tendered'), { target: { value: '0.15' } });
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }));
    await waitFor(() => expect(api.completeSale).toHaveBeenCalledWith(expect.objectContaining({ lines: [{ productId: 'pork', quantity: 0.29, unit: 'pack' }] })));
  });

  it('keeps separate source entries when one product is added in pack and piece units', async () => {
    const api = makeApi();
    render(<SaleComposer api={api} />);
    const search = await screen.findByLabelText(/find a product/i);
    fireEvent.change(search, { target: { value: 'pork' } });
    fireEvent.click(screen.getByRole('button', { name: /add siomai pork/i }));
    await waitForAvailability('25 pc');
    fireEvent.change(screen.getByLabelText(/quantity for siomai pork/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/unit for siomai pork/i), { target: { value: 'pack' } });
    fireEvent.change(search, { target: { value: 'pork' } });
    fireEvent.click(screen.getByRole('button', { name: /add siomai pork/i }));
    const quantities = await screen.findAllByLabelText(/quantity for siomai pork/i);
    expect(quantities).toHaveLength(2);
    expect(quantities[0]).toHaveAccessibleName('Line 1: Quantity for Siomai Pork');
    expect(quantities[1]).toHaveAccessibleName('Line 2: Quantity for Siomai Pork');
    const units = screen.getAllByLabelText(/unit for siomai pork/i);
    expect(units).toHaveLength(2);
    expect(units[0]).toHaveAccessibleName('Line 1: Unit for Siomai Pork');
    expect(units[1]).toHaveAccessibleName('Line 2: Unit for Siomai Pork');
    expect(screen.getByRole('button', { name: 'Remove Siomai Pork, line 2' })).toBeInTheDocument();
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
    expect(screen.getByLabelText(/quantity for siomai pork/i)).toHaveAccessibleDescription(/only 25 pc available/i);
  });

  it('preserves entered values and displays recoverable API errors', async () => {
    const api = makeApi({ completeSale: vi.fn().mockRejectedValue(new Error('The balance changed.')) });
    render(<SaleComposer api={api} />);
    fireEvent.change(await screen.findByLabelText(/find a product/i), { target: { value: 'pork' } });
    fireEvent.click(screen.getByRole('button', { name: /siomai pork/i }));
    await waitForAvailability('25 pc');
    fireEvent.change(screen.getByLabelText(/quantity for siomai pork/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/amount tendered/i), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Customer order' } });
    fireEvent.change(screen.getByLabelText(/find a product/i), { target: { value: 'beef' } });
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The balance changed.');
    expect((screen.getByLabelText(/quantity for siomai pork/i) as HTMLInputElement).value).toBe('2');
    expect(screen.getByLabelText(/find a product/i)).toHaveValue('beef');
    expect(screen.getByLabelText('Amount tendered')).toHaveValue('6');
    expect(screen.getByLabelText('Note')).toHaveValue('Customer order');
  });

  it('shows the completed receipt and requires an explicit void confirmation', async () => {
    const receipt: SaleReceipt = { id: 'sale-1', locationId: 'main', businessAt: '2026-10-06 12:00:00', totalCentavos: 600, paymentCentavos: 1000, changeCentavos: 400, status: 'completed', note: null, lines: [{ productId: 'pork', productName: 'Siomai Pork', quantityPieces: 2, enteredUnit: 'piece', enteredQuantity: '2', unitSellingPriceCentavos: 300, unitCostCentavos: 1000, lineRevenueCentavos: 600, lineCostCentavos: 200, balancePieces: 23 }] };
    const onVoid = vi.fn();
    render(<SaleReceiptView receipt={receipt} onVoid={onVoid} />);
    expect(screen.getAllByText('₱6.00')).toHaveLength(2);
    const trigger = screen.getByRole('button', { name: /void sale/i });
    trigger.focus();
    fireEvent.click(trigger);
    expect(onVoid).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: /void this sale/i });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: /confirm void/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: '   ' } });
    expect(within(dialog).getByRole('button', { name: /confirm void/i })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onVoid).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onVoid).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: ' Entered twice ' } });
    const confirm = screen.getByRole('button', { name: /confirm void/i });
    confirm.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByLabelText(/reason/i)).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: /confirm void/i }));
    await waitFor(() => expect(onVoid).toHaveBeenCalledWith('Entered twice'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows availability and both selling units before adding a product and supports keyboard entry', async () => {
    render(<SaleComposer api={makeApi()} />);
    const search = await screen.findByLabelText(/find a product/i);
    fireEvent.change(search, { target: { value: 'pork' } });
    const result = await screen.findByRole('button', { name: /add siomai pork/i });
    await waitFor(() => expect(result).toHaveTextContent('Available: 25 pc (2 packs + 5 pc)'));
    expect(result).toHaveTextContent('PORK');
    expect(result).toHaveTextContent('₱3.00 / piece');
    expect(result).toHaveTextContent('₱25.00 / pack');
    expect(screen.queryByLabelText(/quantity for siomai pork/i)).not.toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByLabelText(/quantity for siomai pork/i)).toHaveFocus();
    fireEvent.change(screen.getByLabelText(/quantity for siomai pork/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Amount tendered'), { target: { value: '10' } });
    const summary = screen.getByRole('complementary', { name: 'Current order' });
    expect(within(summary).getByText('Items').nextElementSibling).toHaveTextContent('2 pc');
    expect(within(summary).getByText('Total').nextElementSibling).toHaveTextContent('₱6.00');
    expect(within(summary).getByText('Tendered').nextElementSibling).toHaveTextContent('₱10.00');
    expect(within(summary).getByText('Change').nextElementSibling).toHaveTextContent('₱4.00');
    expect(within(summary).getByRole('button', { name: 'Complete sale' })).toBeEnabled();
  });

  it('explains zero-priced lines next to the invalid quantity control', async () => {
    render(<SaleComposer api={makeApi({ listProducts: vi.fn().mockResolvedValue([{ ...pork, sellingPricePerPieceCentavos: 0 }]) })} />);
    fireEvent.change(await screen.findByLabelText(/find a product/i), { target: { value: 'pork' } });
    fireEvent.click(await screen.findByRole('button', { name: /add siomai pork/i }));
    fireEvent.change(screen.getByLabelText(/quantity for siomai pork/i), { target: { value: '1' } });
    expect(screen.getByLabelText(/quantity for siomai pork/i)).toHaveAccessibleDescription(/set a selling price/i);
    expect(screen.getByRole('button', { name: 'Complete sale' })).toBeDisabled();
  });

  it('identifies pending availability before selection and blocks checkout until it is known', async () => {
    let resolveBalances!: (balances: InventoryBalance[]) => void;
    const balances = new Promise<InventoryBalance[]>((resolve) => { resolveBalances = resolve; });
    const api = makeApi({ getBalances: vi.fn().mockReturnValue(balances) });
    render(<SaleComposer api={api} />);
    fireEvent.change(await screen.findByLabelText(/find a product/i), { target: { value: 'pork' } });
    const result = screen.getByRole('button', { name: /add siomai pork/i });
    expect(result).toHaveAccessibleDescription(/checking availability/i);
    expect(result).not.toHaveTextContent('Available: 0 pc');
    fireEvent.click(result);
    fireEvent.change(screen.getByLabelText(/quantity for siomai pork/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Amount tendered'), { target: { value: '3' } });
    expect(screen.getByRole('button', { name: 'Complete sale' })).toBeDisabled();
    resolveBalances([{ locationId: 'main', productId: 'pork', quantityPieces: 25 }]);
    await waitForAvailability('25 pc');
    expect(screen.getByRole('button', { name: 'Complete sale' })).toBeEnabled();
  });

  it.each(['resolves', 'rejects'] as const)('discards a delayed old-location sale refresh when it %s after the current stock loads', async (outcome) => {
    let resolveOld!: (balances: InventoryBalance[]) => void;
    let rejectOld!: (reason: Error) => void;
    let resolveCurrent!: (balances: InventoryBalance[]) => void;
    const oldRefresh = new Promise<InventoryBalance[]>((resolve, reject) => { resolveOld = resolve; rejectOld = reject; });
    const currentStock = new Promise<InventoryBalance[]>((resolve) => { resolveCurrent = resolve; });
    const api = makeApi({
      listLocations: vi.fn().mockResolvedValue([main, { id: 'second', name: 'Second Cart', isActive: true }]),
      getBalances: vi.fn().mockResolvedValueOnce([{ locationId: 'main', productId: 'pork', quantityPieces: 25 }]).mockReturnValueOnce(oldRefresh).mockReturnValueOnce(currentStock),
    });
    const view = render(<SaleComposer api={api} activeLocationId="main" />);
    fireEvent.change(await screen.findByLabelText(/find a product/i), { target: { value: 'pork' } });
    fireEvent.click(screen.getByRole('button', { name: /add siomai pork/i }));
    await waitForAvailability('25 pc');
    fireEvent.change(screen.getByLabelText(/quantity for siomai pork/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Amount tendered'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Complete sale' }));
    await screen.findByRole('region', { name: 'Receipt' });
    expect(api.getBalances).toHaveBeenLastCalledWith('main');
    view.rerender(<SaleComposer api={api} activeLocationId="second" />);
    fireEvent.change(screen.getByLabelText(/find a product/i), { target: { value: 'pork' } });
    fireEvent.click(screen.getByRole('button', { name: /add siomai pork/i }));
    fireEvent.change(screen.getByLabelText(/quantity for siomai pork/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Amount tendered'), { target: { value: '3' } });
    resolveCurrent([{ locationId: 'second', productId: 'pork', quantityPieces: 7 }]);
    await waitForAvailability('7 pc');
    if (outcome === 'resolves') resolveOld([{ locationId: 'main', productId: 'pork', quantityPieces: 23 }]);
    else rejectOld(new Error('Old location refresh failed.'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Complete sale' })).toBeEnabled());
    expect(screen.getByText(/available: 7 pc/i)).toBeInTheDocument();
    expect(screen.queryByText(/checking availability/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/quantity for siomai pork/i)).toHaveValue(1);
    expect(screen.getByLabelText('Amount tendered')).toHaveValue('3');
  });

  it('retains the void reason and shows an API rejection inside the dialog', async () => {
    const receipt = await makeApi().completeSale({ locationId: 'main', lines: [], paymentCentavos: 1000 });
    const onVoid = vi.fn().mockRejectedValue(new Error('Sale could not be voided. Try again.'));
    render(<SaleReceiptView receipt={receipt} onVoid={onVoid} />);
    fireEvent.click(screen.getByRole('button', { name: 'Void sale' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Wrong order' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm void' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Sale could not be voided. Try again.');
    expect(screen.getByLabelText(/reason/i)).toHaveValue('Wrong order');
    expect(screen.getByRole('button', { name: 'Confirm void' })).toBeEnabled();
  });

  it('closes a successful void dialog even when refreshing availability fails', async () => {
    const receipt = await makeApi().completeSale({ locationId: 'main', lines: [], paymentCentavos: 1000 });
    const api = makeApi({
      voidSale: vi.fn().mockResolvedValue({ ...receipt, status: 'voided' }),
      getBalances: vi.fn().mockResolvedValueOnce([{ locationId: 'main', productId: 'pork', quantityPieces: 25 }]).mockResolvedValueOnce([{ locationId: 'main', productId: 'pork', quantityPieces: 23 }]).mockRejectedValue(new Error('Availability refresh failed.')),
    });
    render(<SaleComposer api={api} />);
    fireEvent.change(await screen.findByLabelText(/find a product/i), { target: { value: 'pork' } });
    fireEvent.click(screen.getByRole('button', { name: /add siomai pork/i }));
    await waitForAvailability('25 pc');
    fireEvent.change(screen.getByLabelText(/quantity for siomai pork/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Amount tendered'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Complete sale' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Void sale' }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Duplicate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm void' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Voided')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/sale voided.*availability could not be refreshed/i);
    fireEvent.change(screen.getByLabelText(/find a product/i), { target: { value: 'pork' } });
    expect(screen.getByRole('button', { name: /add siomai pork/i })).toHaveAccessibleDescription(/availability unavailable/i);
    expect(api.voidSale).toHaveBeenCalledTimes(1);
  });

  it('labels receipt status and sales history while refreshing a voided sale', async () => {
    const receipt = await makeApi().completeSale({ locationId: 'main', lines: [], paymentCentavos: 1000 });
    const voided = { ...receipt, status: 'voided' as const };
    const api = makeApi({ listSales: vi.fn().mockResolvedValueOnce([receipt]).mockResolvedValue([voided]), voidSale: vi.fn().mockResolvedValue(voided) });
    render(<SalesPage api={api} activeLocationId="main" />);
    const history = await screen.findByRole('table', { name: 'Recent sales' });
    expect(within(history).getByText('Completed')).toBeInTheDocument();
    fireEvent.click(within(history).getByRole('button', { name: /view receipt/i }));
    const receiptRegion = screen.getByRole('region', { name: 'Receipt' });
    expect(within(receiptRegion).getByText('Completed')).toBeInTheDocument();
    const trigger = within(receiptRegion).getByRole('button', { name: 'Void sale' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toHaveTextContent(/restores each sold quantity/i);
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Duplicate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm void' }));
    await waitFor(() => expect(api.voidSale).toHaveBeenCalledWith('sale-1', 'Duplicate'));
    await waitFor(() => expect(within(history).getByText('Voided')).toBeInTheDocument());
    expect(within(receiptRegion).getByText('Voided')).toBeInTheDocument();
    expect(within(receiptRegion).queryByRole('button', { name: 'Void sale' })).not.toBeInTheDocument();
    await waitFor(() => expect(receiptRegion).toHaveFocus());
    expect(api.listSales).toHaveBeenLastCalledWith({ locationId: 'main' });
  });

  it('refreshes checkout availability after a history void without clearing the current draft', async () => {
    const receipt = await makeApi().completeSale({ locationId: 'main', lines: [], paymentCentavos: 1000 });
    const voided = { ...receipt, status: 'voided' as const };
    const api = makeApi({
      listSales: vi.fn().mockResolvedValue([receipt]), voidSale: vi.fn().mockResolvedValue(voided),
      getBalances: vi.fn().mockResolvedValueOnce([{ locationId: 'main', productId: 'pork', quantityPieces: 25 }]).mockResolvedValue([{ locationId: 'main', productId: 'pork', quantityPieces: 27 }]),
    });
    render(<SalesPage api={api} activeLocationId="main" />);
    fireEvent.change(await screen.findByLabelText(/find a product/i), { target: { value: 'pork' } });
    fireEvent.click(screen.getByRole('button', { name: /add siomai pork/i }));
    await waitForAvailability('25 pc');
    fireEvent.change(screen.getByLabelText(/quantity for siomai pork/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Amount tendered'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Next customer' } });
    fireEvent.click(within(screen.getByRole('table', { name: 'Recent sales' })).getByRole('button', { name: /view receipt/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Void sale' }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Duplicate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm void' }));
    await waitForAvailability('27 pc');
    expect(screen.getByLabelText(/quantity for siomai pork/i)).toHaveValue(1);
    expect(screen.getByLabelText('Amount tendered')).toHaveValue('3');
    expect(screen.getByLabelText('Note')).toHaveValue('Next customer');
    expect(api.getBalances).toHaveBeenCalledTimes(2);
  });

  it('renders repeated source sale lines as separate receipt rows', () => {
    const receipt: SaleReceipt = { id: 'sale-1', locationId: 'main', businessAt: '2026-10-06 12:00:00', totalCentavos: 1200, paymentCentavos: 1300, changeCentavos: 100, status: 'completed', note: null, lines: [
      { productId: 'pork', productName: 'Siomai Pork', quantityPieces: 10, enteredUnit: 'pack', enteredQuantity: '1', unitSellingPriceCentavos: 900, unitCostCentavos: 1000, lineRevenueCentavos: 900, lineCostCentavos: 1000, balancePieces: 15 },
      { productId: 'pork', productName: 'Siomai Pork', quantityPieces: 1, enteredUnit: 'piece', enteredQuantity: '1', unitSellingPriceCentavos: 300, unitCostCentavos: 1000, lineRevenueCentavos: 300, lineCostCentavos: 100, balancePieces: 15 },
    ] };
    render(<SaleReceiptView receipt={receipt} onVoid={vi.fn()} />);
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('1 pack');
    expect(rows[2]).toHaveTextContent('1 piece');
  });
});
