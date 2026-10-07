// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import AppShell from '../../src/renderer/components/AppShell';
import type { CatalogLocation } from '../../src/shared/schemas';

afterEach(cleanup);

const defaultLocations: CatalogLocation[] = [
  { id: 'main', name: 'Main Cart', isActive: true },
  { id: 'market', name: 'Market Cart', isActive: true },
];

function ShellHarness({ locations = defaultLocations, initialPage = 'Dashboard' }: { locations?: CatalogLocation[]; initialPage?: string }) {
  const [page, setPage] = useState(initialPage);
  const [locationId, setLocationId] = useState('main');
  const [date, setDate] = useState('2026-10-07');
  return <AppShell page={page} onNavigate={setPage} locations={locations} locationId={locationId} date={date}
    onLocationChange={setLocationId} onDateChange={setDate}>
    <output aria-label="Current view">{page}</output>
  </AppShell>;
}

describe('application shell', () => {
  it('groups navigation by operator job', () => {
    render(<ShellHarness />);
    const today = screen.getByRole('group', { name: 'Today' });
    const stock = screen.getByRole('group', { name: 'Stock operations' });
    const review = screen.getByRole('group', { name: 'Review' });
    for (const label of ['Overview', 'New sale', 'Inventory']) expect(within(today).getByRole('button', { name: label })).toBeInTheDocument();
    for (const label of ['Replenish', 'Transfers', 'Stock count']) expect(within(stock).getByRole('button', { name: label })).toBeInTheDocument();
    for (const label of ['Reports', 'Products', 'Locations', 'Import data', 'Settings']) expect(within(review).getByRole('button', { name: label })).toBeInTheDocument();
    fireEvent.click(within(review).getByRole('button', { name: 'Import data' }));
    expect(screen.getByLabelText('Current view')).toHaveTextContent(/^Import$/);
    expect(within(review).getByRole('button', { name: 'Import data' })).toHaveAttribute('aria-current', 'page');
  });

  it('maps Overview to the Dashboard view', () => {
    render(<ShellHarness initialPage="Reports" />);
    const overview = screen.getByRole('button', { name: 'Overview' });
    expect(screen.getByRole('button', { name: 'Reports' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(overview);
    expect(screen.getByLabelText('Current view')).toHaveTextContent(/^Dashboard$/);
    expect(overview).toHaveAttribute('aria-current', 'page');
    expect(overview).toHaveAttribute('title', 'Overview');
    expect(screen.getByRole('button', { name: 'Reports' })).not.toHaveAttribute('aria-current');
    expect(overview.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps global context accessible', () => {
    render(<ShellHarness />);
    const location = screen.getByRole('combobox', { name: 'Current location' });
    const date = screen.getByLabelText('Global business date');
    expect(screen.getByText('Location')).toBeVisible();
    expect(screen.getByText('Business date')).toBeVisible();
    fireEvent.change(location, { target: { value: 'market' } });
    fireEvent.change(date, { target: { value: '2026-10-06' } });
    fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'New sale' }));
    expect(screen.getByLabelText('Current view')).toHaveTextContent(/^Sales$/);
    expect(location).toHaveValue('market');
    expect(date).toHaveValue('2026-10-06');
    expect(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: 'New sale' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('handles long context labels', () => {
    const longName = 'M'.repeat(120);
    render(<ShellHarness locations={[defaultLocations[0], { id: 'long', name: longName, isActive: true }]} />);
    const location = screen.getByRole('combobox', { name: 'Current location' });
    fireEvent.change(location, { target: { value: 'long' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reports' }));
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    expect(location).toHaveValue('long');
    expect(screen.getByRole('option', { name: longName, selected: true })).toBeInTheDocument();
    expect(location).toHaveAttribute('title', longName);
    expect(screen.getByLabelText('Current view')).toHaveTextContent(/^Dashboard$/);
  });
});
