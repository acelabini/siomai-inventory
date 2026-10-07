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
    previewCsvImport: vi.fn().mockResolvedValue({ token: 'preview-1', contentHash: 'a'.repeat(64), kind: 'products', validRows: 1, invalidRows: 0, fileErrors: 0, errors: [], summary: '1 valid row ready to import.', columns: ['Product', 'Code'] }),
    commitCsvImport: vi.fn().mockResolvedValue({ importedRows: 1, aggregate: false }),
    listLocations: vi.fn().mockResolvedValue([{ id: 'loc-1', name: 'Main Cart', isActive: true }]),
    ...overrides,
  } as unknown as InventoryApi;
}

describe('ImportPage', () => {
  it('keeps the operator on the choose-file stage when the dialog is canceled', async () => {
    render(<ImportPage api={api({ chooseCsvImportFile: vi.fn().mockResolvedValue(null) })} onComplete={vi.fn()} />);
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('Opening stock')).toBeInTheDocument();
    expect(screen.getByText('Spreadsheet aggregate')).toBeInTheDocument();
    expect(screen.getByText(/product details and optional opening packs/i)).toBeInTheDocument();
    expect(screen.getByText(/starting quantities matched by sku or product name/i)).toBeInTheDocument();
    expect(screen.getByText(/without creating sales/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /choose csv file/i }));
    await screen.findByText(/your file is checked before any data is added/i);
    const stages = screen.getByRole('list', { name: /import stages/i });
    expect(stages.querySelector('[aria-current="step"]')).toHaveTextContent('Choose file');
    expect(stages.querySelectorAll('[data-state="completed"]')).toHaveLength(0);
  });

  it('lets the operator choose a location for opening packs in a products file', async () => {
    const previewCsvImport = vi.fn().mockResolvedValue({ token: 'preview-1', contentHash: 'a'.repeat(64), kind: 'products', validRows: 1, invalidRows: 0, fileErrors: 0, errors: [], summary: '1 valid row ready to import.', columns: ['SKU', 'Name', 'Pieces per pack', 'Purchase cost (PHP)', 'Piece price (PHP)', 'Pack price (PHP)', 'Opening packs'] });
    const services = api({
      chooseCsvImportFile: vi.fn().mockResolvedValue({ fileName: 'products.csv', csv: 'SKU,Name,Pieces per pack,Purchase cost (PHP),Piece price (PHP),Pack price (PHP),Opening packs\nA,Product,10,10,1,9,2' }),
      previewCsvImport,
    });
    render(<ImportPage api={services} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /choose csv file/i }));
    await screen.findByRole('heading', { name: /map columns/i });
    const stages = screen.getByRole('list', { name: /import stages/i });
    expect(stages.querySelector('[aria-current="step"]')).toHaveTextContent('Map columns');
    expect(stages.querySelectorAll('[data-state="completed"]')).toHaveLength(1);
    expect(screen.getByText(/required columns are marked/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/import location/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /preview and validate/i }));
    await waitFor(() => expect(previewCsvImport).toHaveBeenCalledWith(expect.objectContaining({ kind: 'products', locationId: 'loc-1' })));
  });

  it('maps columns, previews row errors, and disables commit while errors remain', async () => {
    const previewCsvImport = vi.fn().mockResolvedValue({ token: 'preview-1', contentHash: 'a'.repeat(64), kind: 'opening-stock', validRows: 1, invalidRows: 1, fileErrors: 0, errors: [{ row: 3, message: 'Product was not found.' }], summary: '1 valid row ready to import.', columns: ['Product', 'Qty', 'Measure'] });
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
    expect(screen.getByRole('list', { name: /import stages/i }).querySelectorAll('[data-state="completed"]')).toHaveLength(2);
    expect(previewCsvImport).toHaveBeenCalledWith(expect.objectContaining({ mapping: { name: 'Product', quantity: 'Qty', unit: 'Measure' } }));
    expect(screen.getByRole('button', { name: /commit import/i })).toBeDisabled();
  });

  it('allows SKU-only opening-stock mapping and labels both product selectors optional', async () => {
    const previewCsvImport = vi.fn().mockResolvedValue({ token: 'preview-sku', contentHash: 'c'.repeat(64), kind: 'opening-stock', validRows: 1, invalidRows: 0, fileErrors: 0, errors: [], summary: '1 valid row ready to import.', columns: ['SKU', 'Qty', 'Unit'] });
    const services = api({
      chooseCsvImportFile: vi.fn().mockResolvedValue({ fileName: 'opening.csv', csv: 'SKU,Qty,Unit\nPORK,2,pack' }),
      previewCsvImport,
    });
    render(<ImportPage api={services} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /choose csv file/i }));
    await screen.findByRole('heading', { name: /map columns/i });
    fireEvent.change(screen.getByLabelText(/import type/i), { target: { value: 'opening-stock' } });
    expect(screen.getByLabelText('SKU').parentElement).toHaveTextContent(/optional/i);
    expect(screen.getByLabelText('Product name').parentElement).toHaveTextContent(/optional/i);
    expect(screen.getByText(/map at least one: SKU or product name/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'SKU' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: 'Qty' } });
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'Unit' } });
    fireEvent.click(screen.getByRole('button', { name: /preview and validate/i }));
    await waitFor(() => expect(previewCsvImport).toHaveBeenCalledWith(expect.objectContaining({ mapping: { sku: 'SKU', quantity: 'Qty', unit: 'Unit' } })));
  });

  it('shows file-level parser/header problems in a separate file issues count', async () => {
    const services = api({
      previewCsvImport: vi.fn().mockResolvedValue({ token: 'preview-file-error', contentHash: 'd'.repeat(64), kind: 'products', validRows: 1, invalidRows: 0, fileErrors: 1, errors: [{ row: 1, message: 'Duplicate column "SKU".' }], summary: '1 valid row ready to import.', columns: ['SKU', 'SKU'] }),
    });
    render(<ImportPage api={services} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /choose csv file/i }));
    await screen.findByRole('heading', { name: /map columns/i });
    fireEvent.click(screen.getByRole('button', { name: /preview and validate/i }));
    expect(await screen.findByRole('heading', { name: 'File issues' })).toBeInTheDocument();
    expect(screen.getByText('Duplicate column "SKU".')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /commit import/i })).toBeDisabled();
  });

  it('shows a data-row parser error exactly once and counts it as an invalid row', async () => {
    const message = 'Unexpected text after a quoted field.';
    const services = api({
      previewCsvImport: vi.fn().mockResolvedValue({ token: 'preview-malformed-row', contentHash: 'e'.repeat(64), kind: 'products', validRows: 0, invalidRows: 0, fileErrors: 1, errors: [{ row: 2, message }], summary: '0 valid rows ready to import.', columns: ['SKU', 'Name'] }),
    });
    render(<ImportPage api={services} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /choose csv file/i }));
    await screen.findByRole('heading', { name: /map columns/i });
    fireEvent.click(screen.getByRole('button', { name: /preview and validate/i }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getAllByText(message)).toHaveLength(1);
    expect(screen.getByText('Invalid rows').nextElementSibling).toHaveTextContent('1');
    expect(screen.getByText('File issues').nextElementSibling).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: /commit import/i })).toBeDisabled();
  });

  it('commits an aggregate file and reports the imported rows without claiming sales were created', async () => {
    const commitCsvImport = vi.fn().mockResolvedValue({ importedRows: 1, aggregate: true });
    const onComplete = vi.fn();
    const services = api({
      chooseCsvImportFile: vi.fn().mockResolvedValue({ fileName: 'daily.csv', csv: 'Product name,Pieces per pack,Pack quantity,Replenishment quantity,Pieces,Total cost\nSiomai Pork,10,2,1,3,30.00' }),
      previewCsvImport: vi.fn().mockResolvedValue({ token: 'preview-aggregate', contentHash: 'b'.repeat(64), kind: 'spreadsheet-aggregate', validRows: 1, invalidRows: 0, fileErrors: 0, errors: [], summary: 'Imported aggregate stock data. No transaction sales will be created.', columns: ['Product name', 'Pieces per pack', 'Pack quantity', 'Replenishment quantity', 'Pieces', 'Total cost'] }),
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
    expect(screen.getByRole('list', { name: /import stages/i }).querySelectorAll('[data-state="completed"]')).toHaveLength(4);
    expect(commitCsvImport).toHaveBeenCalledWith(expect.objectContaining({ token: 'preview-aggregate', contentHash: 'b'.repeat(64) }));
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
