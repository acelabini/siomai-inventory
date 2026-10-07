// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventoryApi } from '../../src/shared/contracts';
import type { CatalogProduct } from '../../src/shared/schemas';
import ProductsPage from '../../src/renderer/pages/ProductsPage';

afterEach(cleanup);

const product: CatalogProduct = {
  id: 'pork', sku: 'PORK', name: 'Siomai Pork', piecesPerPack: 10,
  purchaseCostPerPackCentavos: 1000, sellingPricePerPieceCentavos: 100,
  sellingPricePerPackCentavos: 900, lowStockThresholdPieces: 7, isActive: true,
};

function makeApi(overrides: Partial<InventoryApi> = {}): InventoryApi {
  return {
    listProducts: vi.fn().mockResolvedValue([product]), saveProduct: vi.fn().mockResolvedValue(product),
    archiveProduct: vi.fn(),
    ...overrides,
  } as unknown as InventoryApi;
}

describe('ProductsPage', () => {
  it('preloads and preserves the configured piece threshold when editing a product', async () => {
    const api = makeApi();
    render(<ProductsPage api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const threshold = screen.getByRole('spinbutton', { name: /low-stock threshold/i });
    expect(threshold).toHaveValue(7);
    fireEvent.change(screen.getByLabelText(/product name/i), { target: { value: 'Siomai Pork Premium' } });
    fireEvent.click(screen.getByRole('button', { name: /save product/i }));
    await waitFor(() => expect(api.saveProduct).toHaveBeenCalledWith(expect.objectContaining({
      id: 'pork', name: 'Siomai Pork Premium', lowStockThresholdPieces: 7,
    })));
  });

  it('requires a nonnegative whole-piece low-stock threshold', async () => {
    const api = makeApi();
    render(<ProductsPage api={api} />);
    const threshold = await screen.findByRole('spinbutton', { name: /low-stock threshold/i });
    fireEvent.change(threshold, { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: /save product/i }));
    expect(api.saveProduct).not.toHaveBeenCalled();
    expect(threshold).toHaveAttribute('min', '0');
    expect(threshold).toHaveAttribute('step', '1');
  });
});
