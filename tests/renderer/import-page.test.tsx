// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventoryApi } from '../../src/shared/contracts';
import ImportPage from '../../src/renderer/pages/ImportPage';

afterEach(cleanup);

function api(overrides: Partial<InventoryApi> = {}): InventoryApi {
  return {
    chooseCsvImportFile: vi.fn().mockResolvedValue({ fileName: 'products.csv', csv: 'Product,Code\nPork,SKU-1' }),
    previewCsvImport: vi.fn().mockResolvedValue({ token: 'preview-1', contentHash: 'a'.repeat(64), kind: 'products', validRows: 1, invalidRows: 0, errors: [], summary: '1 valid row ready to import.', columns: ['Product', 'Code'] }),
    commitCsvImport: vi.fn().mockResolvedValue({ importedRows: 1, aggregate: false }),
    listLocations: vi.fn().mockResolvedValue([{ id: 'loc-1', name: 'Main Cart', isActive: true }]),
    ...overrides,
  } as unknown as InventoryApi;
}

describe('ImportPage', () => {
  it('keeps the operator on the choose-file stage when the dialog is canceled', async () => {
    render(<ImportPage api={api({ chooseCsvImportFile: vi.fn().mockResolvedValue(null) })} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /choose csv file/i }));
    await screen.findByText(/choose a csv file to begin/i);
    expect(screen.getByRole('list', { name: /import stages/i }).querySelector('[aria-current="step"]')).toHaveTextContent('1 Choose file');
  });

  it('lets the operator choose a location for opening packs in a products file', async () => {
    const previewCsvImport = vi.fn().mockResolvedValue({ token: 'preview-1', contentHash: 'a'.repeat(64), kind: 'products', validRows: 1, invalidRows: 0, errors: [], summary: '1 valid row ready to import.', columns: ['SKU', 'Name', 'Pieces per pack', 'Purchase cost (PHP)', 'Piece price (PHP)', 'Pack price (PHP)', 'Opening packs'] });
    const services = api({
      chooseCsvImportFile: vi.fn().mockResolvedValue({ fileName: 'products.csv', csv: 'SKU,Name,Pieces per pack,Purchase cost (PHP),Piece price (PHP),Pack price (PHP),Opening packs\nA,Product,10,10,1,9,2' }),
      previewCsvImport,
    });
    render(<ImportPage api={services} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /choose csv file/i }));
    await screen.findByRole('heading', { name: /map columns/i });
    expect(screen.getByLabelText(/import location/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /preview and validate/i }));
    await waitFor(() => expect(previewCsvImport).toHaveBeenCalledWith(expect.objectContaining({ kind: 'products', locationId: 'loc-1' })));
  });

  it('maps columns, previews row errors, and disables commit while errors remain', async () => {
    const previewCsvImport = vi.fn().mockResolvedValue({ token: 'preview-1', contentHash: 'a'.repeat(64), kind: 'opening-stock', validRows: 1, invalidRows: 1, errors: [{ row: 3, message: 'Product was not found.' }], summary: '1 valid row ready to import.', columns: ['Product', 'Qty', 'Measure'] });
    const services = api({
      chooseCsvImportFile: vi.fn().mockResolvedValue({ fileName: 'opening.csv', csv: 'Product,Qty,Measure\nPork,2,pack' }),
      previewCsvImport,
    });
    render(<ImportPage api={services} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /choose csv file/i }));
    await screen.findByRole('heading', { name: /map columns/i });
    fireEvent.change(screen.getByLabelText(/import type/i), { target: { value: 'opening-stock' } });
    fireEvent.change(screen.getByLabelText(/product name/i), { target: { value: 'Product' } });
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: 'Qty' } });
    fireEvent.change(screen.getByLabelText(/unit/i), { target: { value: 'Measure' } });
    fireEvent.click(screen.getByRole('button', { name: /preview and validate/i }));
    expect(await screen.findByText('Row 3')).toBeInTheDocument();
    expect(previewCsvImport).toHaveBeenCalledWith(expect.objectContaining({ mapping: { name: 'Product', quantity: 'Qty', unit: 'Measure' } }));
    expect(screen.getByRole('button', { name: /commit import/i })).toBeDisabled();
  });

  it('commits an aggregate file and reports the imported rows without claiming sales were created', async () => {
    const commitCsvImport = vi.fn().mockResolvedValue({ importedRows: 1, aggregate: true });
    const onComplete = vi.fn();
    const services = api({
      chooseCsvImportFile: vi.fn().mockResolvedValue({ fileName: 'daily.csv', csv: 'Product name,Pieces per pack,Pack quantity,Replenishment quantity,Pieces,Total cost\nSiomai Pork,10,2,1,3,30.00' }),
      previewCsvImport: vi.fn().mockResolvedValue({ token: 'preview-aggregate', contentHash: 'b'.repeat(64), kind: 'spreadsheet-aggregate', validRows: 1, invalidRows: 0, errors: [], summary: 'Imported aggregate stock data. No transaction sales will be created.', columns: ['Product name', 'Pieces per pack', 'Pack quantity', 'Replenishment quantity', 'Pieces', 'Total cost'] }),
      commitCsvImport,
    });
    render(<ImportPage api={services} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /choose csv file/i }));
    await screen.findByRole('heading', { name: /map columns/i });
    fireEvent.change(screen.getByLabelText(/import type/i), { target: { value: 'spreadsheet-aggregate' } });
    fireEvent.click(screen.getByRole('button', { name: /preview and validate/i }));
    expect(await screen.findByText(/no transaction sales will be created/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /commit import/i }));
    await screen.findByText(/imported 1 row/i);
    expect(commitCsvImport).toHaveBeenCalledWith(expect.objectContaining({ token: 'preview-aggregate', contentHash: 'b'.repeat(64) }));
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
