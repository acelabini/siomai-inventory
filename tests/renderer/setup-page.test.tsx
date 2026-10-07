// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventoryApi } from '../../src/shared/contracts';
import SetupPage from '../../src/renderer/pages/SetupPage';

afterEach(cleanup);

const sampleProducts = [
  { id: 'siomai-pork', name: 'Siomai Pork', sku: 'SIO-PORK', piecesPerPack: 66, purchaseCostPerPackCentavos: 14600, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0 },
  { id: 'siomai-beef', name: 'Siomai Beef', sku: 'SIO-BEEF', piecesPerPack: 60, purchaseCostPerPackCentavos: 14000, sellingPricePerPieceCentavos: 0, sellingPricePerPackCentavos: 0 },
];

function setupApi(completeSetup: ReturnType<typeof vi.fn>): InventoryApi {
  return {
    getSetupState: vi.fn().mockResolvedValue({ complete: false, businessName: null, locations: [], sampleProducts }),
    completeSetup,
    listProducts: vi.fn(), saveProduct: vi.fn(), archiveProduct: vi.fn(),
    listLocations: vi.fn(), saveLocation: vi.fn(), archiveLocation: vi.fn(),
  } as unknown as InventoryApi;
}

describe('SetupPage', () => {
  it('requires a business name and location before proceeding', async () => {
    render(<SetupPage api={setupApi(vi.fn())} onComplete={vi.fn()} />);
    await screen.findByRole('heading', { name: /set up your business/i });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByText(/business name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/location name is required/i)).toBeInTheDocument();
  });

  it('lets the operator select sample products', async () => {
    render(<SetupPage api={setupApi(vi.fn())} onComplete={vi.fn()} />);
    await screen.findByRole('heading', { name: /set up your business/i });
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: 'Cart ni Ate' } });
    fireEvent.change(screen.getByLabelText(/location name/i), { target: { value: 'Main Cart' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(await screen.findByLabelText(/siomai pork/i));
    expect(screen.getByLabelText(/siomai pork/i)).toBeChecked();
  });

  it('completes required setup before taking the operator to CSV import', async () => {
    const completeSetup = vi.fn().mockResolvedValue({ complete: true, businessName: 'Cart ni Ate', locationId: 'location-1' });
    const onComplete = vi.fn();
    render(<SetupPage api={setupApi(completeSetup)} onComplete={onComplete} />);
    await screen.findByRole('heading', { name: /set up your business/i });
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: 'Cart ni Ate' } });
    fireEvent.change(screen.getByLabelText(/location name/i), { target: { value: 'Main Cart' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(await screen.findByRole('radio', { name: /import products or stock from csv/i }));
    fireEvent.click(screen.getByRole('button', { name: /complete setup and import csv/i }));
    await waitFor(() => expect(completeSetup).toHaveBeenCalledWith({
      businessName: 'Cart ni Ate', locationName: 'Main Cart', sampleProductIds: [], openingStock: [],
    }));
    expect(onComplete).toHaveBeenCalledWith('Import');
  });

  it('rejects negative opening stock and submits trimmed names and normalized values', async () => {
    const completeSetup = vi.fn().mockResolvedValue({ complete: true, businessName: 'Cart ni Ate', locationId: 'location-1' });
    const onComplete = vi.fn();
    render(<SetupPage api={setupApi(completeSetup)} onComplete={onComplete} />);
    await screen.findByRole('heading', { name: /set up your business/i });
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: '  Cart ni Ate  ' } });
    fireEvent.change(screen.getByLabelText(/location name/i), { target: { value: '  Main Cart  ' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(await screen.findByLabelText(/siomai pork/i));
    fireEvent.click(screen.getByRole('button', { name: /continue to opening stock/i }));
    const openingStock = screen.getByLabelText(/opening pieces for siomai pork/i);
    fireEvent.change(openingStock, { target: { value: '-2' } });
    expect(screen.getByText(/must be zero or more/i)).toBeInTheDocument();
    fireEvent.change(openingStock, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));
    await waitFor(() => expect(completeSetup).toHaveBeenCalledWith({
      businessName: 'Cart ni Ate',
      locationName: 'Main Cart',
      sampleProductIds: ['siomai-pork'],
      openingStock: [{ productId: 'siomai-pork', quantityPieces: 12 }],
    }));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
