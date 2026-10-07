// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventoryApi } from '../../src/shared/contracts';
import type { CatalogLocation } from '../../src/shared/schemas';
import LocationsPage from '../../src/renderer/pages/LocationsPage';

afterEach(cleanup);

const locations: CatalogLocation[] = [
  { id: 'market', name: 'Main Market Cart', isActive: true },
  { id: 'annex', name: 'Weekend Annex', isActive: true },
];

function makeApi(overrides: Partial<InventoryApi> = {}): InventoryApi {
  return {
    listLocations: vi.fn().mockResolvedValue(locations),
    getBalances: vi.fn().mockImplementation(async (id: string) => id === 'market'
      ? [{ locationId: id, productId: 'pork', quantityPieces: 14 }, { locationId: id, productId: 'rice', quantityPieces: 5 }]
      : [{ locationId: id, productId: 'rice', quantityPieces: 3 }]),
    saveLocation: vi.fn().mockResolvedValue(locations[0]),
    archiveLocation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as InventoryApi;
}

describe('LocationsPage', () => {
  it('labels the current location and summarizes product and piece balances', async () => {
    const api = makeApi();
    render(<LocationsPage api={api} activeLocationId="market" />);

    const current = await screen.findByText('Current location');
    expect(current).toBeInTheDocument();
    expect(screen.getByText('Main Market Cart')).toBeInTheDocument();
    expect(screen.getByText('19 pc')).toBeInTheDocument();
    expect(screen.getByText('2 products')).toBeInTheDocument();
    expect(screen.getByText('3 pc')).toBeInTheDocument();
    expect(screen.getByText('1 product')).toBeInTheDocument();
    expect(api.getBalances).toHaveBeenCalledWith('market');
    expect(api.getBalances).toHaveBeenCalledWith('annex');
  });

  it('focuses add and edit forms and retains the edited name after an API failure', async () => {
    const api = makeApi({ saveLocation: vi.fn().mockRejectedValue(new Error('Location is in use.')) });
    render(<LocationsPage api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add location' }));
    expect(screen.getByRole('textbox', { name: /location name/i })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    fireEvent.click(await screen.findByRole('button', { name: /edit main market cart/i }));
    const input = screen.getByRole('textbox', { name: /location name/i });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'Updated Market Cart' } });
    fireEvent.click(screen.getByRole('button', { name: /save location/i }));
    expect(await screen.findByText('Location is in use.')).toBeInTheDocument();
    expect(input).toHaveValue('Updated Market Cart');
  });

  it('displays long location names, explains retained history, and cancels archive safely', async () => {
    const longName = ('Downtown ' + 'Weekend Market '.repeat(9)).trim();
    const api = makeApi({ listLocations: vi.fn().mockResolvedValue([{ id: 'long', name: longName, isActive: true }]) });
    render(<LocationsPage api={api} />);
    const name = await screen.findByRole('heading', { name: longName });
    expect(name).toHaveAttribute('title', longName);
    fireEvent.click(screen.getByRole('button', { name: `Archive ${longName}` }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/at least one other active location remains/i);
    expect(dialog).toHaveTextContent(/history will be kept/i);
    expect(dialog).not.toHaveTextContent(/related records may not be archived/i);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(api.archiveLocation).not.toHaveBeenCalled();
  });

  it('keeps location archive failures visible in the dialog and allows retry or cancellation', async () => {
    const archiveLocation = vi.fn().mockRejectedValueOnce(new Error('At least one active location must remain.')).mockResolvedValue(undefined);
    const api = makeApi({ archiveLocation });
    render(<LocationsPage api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Main Market Cart' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive location' }));

    const failure = await within(dialog).findByRole('alert');
    expect(failure).toHaveTextContent('At least one active location must remain.');
    expect(failure).toHaveTextContent(/you can retry or cancel/i);
    expect(within(dialog).getByRole('button', { name: 'Archive location' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive location' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(archiveLocation).toHaveBeenCalledTimes(2);
  });
});
