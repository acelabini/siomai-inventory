// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const archivedProduct: CatalogProduct = { ...product, id: 'rice', sku: 'RICE', name: 'Premium Jasmine Rice', isActive: false };

function makeApi(overrides: Partial<InventoryApi> = {}): InventoryApi {
  return {
    listProducts: vi.fn().mockResolvedValue([product]), saveProduct: vi.fn().mockResolvedValue(product),
    archiveProduct: vi.fn(),
    ...overrides,
  } as unknown as InventoryApi;
}

describe('ProductsPage', () => {
  it('searches and filters active and archived products from the complete catalog', async () => {
    const api = makeApi({ listProducts: vi.fn().mockResolvedValue([product, archivedProduct]) });
    render(<ProductsPage api={api} />);

    expect(await screen.findByText('Siomai Pork')).toBeInTheDocument();
    expect(screen.queryByText('Premium Jasmine Rice')).not.toBeInTheDocument();
    expect(api.listProducts).toHaveBeenCalledWith({ includeArchived: true });

    fireEvent.change(screen.getByRole('searchbox', { name: /search products/i }), { target: { value: 'rice' } });
    fireEvent.click(screen.getByRole('radio', { name: /archived/i }));
    expect(screen.getByText('Premium Jasmine Rice')).toBeInTheDocument();
    expect(screen.queryByText('Siomai Pork')).not.toBeInTheDocument();
  });

  it('displays peso form values and saves exact centavos', async () => {
    const api = makeApi();
    render(<ProductsPage api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    const cost = screen.getByRole('spinbutton', { name: /purchase cost per pack.*pesos/i });
    const piecePrice = screen.getByRole('spinbutton', { name: /selling price per piece.*pesos/i });
    expect(cost).toHaveValue(10);
    expect(piecePrice).toHaveValue(1);
    fireEvent.change(cost, { target: { value: '10.05' } });
    fireEvent.change(piecePrice, { target: { value: '1.07' } });
    fireEvent.click(screen.getByRole('button', { name: /save product/i }));

    await waitFor(() => expect(api.saveProduct).toHaveBeenCalledWith(expect.objectContaining({
      id: 'pork',
      purchaseCostPerPackCentavos: 1005,
      sellingPricePerPieceCentavos: 107,
    })));
  });

  it('keeps long product names available accessibly and confirms archive before acting', async () => {
    const longName = ('Siomai ' + 'Premium '.repeat(16)).trim();
    const longProduct = { ...product, name: longName };
    const api = makeApi({ listProducts: vi.fn().mockResolvedValue([longProduct]) });
    render(<ProductsPage api={api} />);
    const name = await screen.findByLabelText(longName);
    expect(name).toHaveAttribute('title', longName);

    fireEvent.click(screen.getByRole('button', { name: `Archive ${longName}` }));
    expect(await screen.findByRole('dialog', { name: new RegExp(longName) })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(api.archiveProduct).not.toHaveBeenCalled();
  });

  it('keeps archive failures visible in the dialog and allows retry or cancellation', async () => {
    const archiveProduct = vi.fn().mockRejectedValueOnce(new Error('Product has related stock records.')).mockResolvedValue(undefined);
    const api = makeApi({ archiveProduct });
    render(<ProductsPage api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Siomai Pork' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive product' }));

    const failure = await within(dialog).findByRole('alert');
    expect(failure).toHaveTextContent('Product has related stock records.');
    expect(failure).toHaveTextContent(/you can retry or cancel/i);
    expect(within(dialog).getByRole('button', { name: 'Archive product' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive product' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(archiveProduct).toHaveBeenCalledTimes(2);
  });

  it('clears a prior archive error when opening another product confirmation', async () => {
    const secondProduct = { ...product, id: 'chicken', sku: 'CHICKEN', name: 'Siomai Chicken' };
    const archiveProduct = vi.fn().mockRejectedValueOnce(new Error('The product is in use.')).mockResolvedValue(undefined);
    const api = makeApi({ listProducts: vi.fn().mockResolvedValue([product, secondProduct]), archiveProduct });
    render(<ProductsPage api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Siomai Pork' }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive product' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The product is in use.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Archive Siomai Chicken' }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(archiveProduct).toHaveBeenCalledOnce();
  });

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
    fireEvent.click(await screen.findByRole('button', { name: /add product/i }));
    const threshold = await screen.findByRole('spinbutton', { name: /low-stock threshold/i });
    fireEvent.change(threshold, { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: /save product/i }));
    expect(api.saveProduct).not.toHaveBeenCalled();
    expect(threshold).toHaveAttribute('min', '0');
    expect(threshold).toHaveAttribute('step', '1');
  });
});
