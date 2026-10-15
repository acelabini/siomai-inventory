// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppShell from '../../src/renderer/components/AppShell';
import DataTable from '../../src/renderer/components/DataTable';
import { readFileSync } from 'node:fs';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Harness({ initialPage = 'Dashboard' }: { initialPage?: string }) {
  const [page, setPage] = useState(initialPage);
  return <AppShell page={page} onNavigate={setPage} locations={[{ id: 'cart', name: 'Market Cart', isActive: true }]} locationId="cart" date="2026-10-15" onLocationChange={() => {}} onDateChange={() => {}}>
    <output aria-label="Current view">{page}</output>
  </AppShell>;
}

describe('mobile order rail', () => {
  it('exposes the three daily destinations and a More sheet trigger', () => {
    render(<Harness />);
    const rail = screen.getByRole('navigation', { name: 'Mobile primary' });
    expect(within(rail).getAllByRole('button').map((button) => button.textContent)).toEqual(['Overview', 'New sale', 'Inventory', 'More']);
    fireEvent.click(within(rail).getByRole('button', { name: 'New sale' }));
    expect(screen.getByLabelText('Current view')).toHaveTextContent('Sales');
    expect(within(rail).getByRole('button', { name: 'New sale' })).toHaveAttribute('aria-current', 'page');
  });

  it('opens a modal secondary navigation, traps focus, and restores it on Escape', () => {
    render(<Harness />);
    const more = within(screen.getByRole('navigation', { name: 'Mobile primary' })).getByRole('button', { name: 'More' });
    more.focus();
    fireEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const sheet = screen.getByRole('dialog', { name: 'More destinations' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(more).toHaveAttribute('aria-controls', sheet.id);
    const close = within(sheet).getByRole('button', { name: 'Close navigation' });
    expect(close).toHaveFocus();
    const last = within(sheet).getByRole('button', { name: 'Settings' });
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(close).toHaveFocus();
    more.focus();
    expect(close).toHaveFocus();
    fireEvent.keyDown(sheet, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('keeps secondary destinations reachable and indicates the active destination', () => {
    render(<Harness initialPage="Reports" />);
    const more = within(screen.getByRole('navigation', { name: 'Mobile primary' })).getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-current', 'true');
    fireEvent.click(more);
    const sheet = screen.getByRole('dialog');
    for (const name of ['Replenish', 'Transfers', 'Stock count', 'Reports', 'Products', 'Locations', 'Import data', 'Settings']) {
      expect(within(sheet).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(within(sheet).getByRole('button', { name: 'Reports' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Import data' }));
    expect(screen.getByLabelText('Current view')).toHaveTextContent('Import');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it('dismisses through the close control and backdrop but not sheet content', () => {
    render(<Harness />);
    const more = within(screen.getByRole('navigation', { name: 'Mobile primary' })).getByRole('button', { name: 'More' });
    fireEvent.click(more);
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close navigation' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(more);
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it('releases the modal when resizing into the desktop layout', () => {
    const media = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal('matchMedia', () => media);
    render(<Harness />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Mobile primary' })).getByRole('button', { name: 'More' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.querySelector('.app-shell')).toHaveAttribute('inert');
    media.matches = true;
    act(() => { media.dispatchEvent(new Event('change')); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('.app-shell')).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

it('retains table semantics, literal card labels, long values, and record actions', () => {
  let edited = false;
  const name = 'Pork siomai '.repeat(18);
  render(<DataTable label="Products" columns={[
    { key: 'name', label: 'Product <name>', render: (row: { id: string; name: string }) => row.name },
    { key: 'actions', label: 'Actions', render: () => <button onClick={() => { edited = true; }}>Edit product</button> },
  ]} rows={[{ id: 'pork', name }]} rowKey={(row) => row.id} />);
  const table = screen.getByRole('table', { name: 'Products' });
  const cell = within(table).getByRole('cell', { name: name.trim() });
  expect(cell).toHaveAttribute('data-label', 'Product <name>');
  expect(within(table).getByRole('columnheader', { name: 'Product <name>' })).toHaveAttribute('scope', 'col');
  const action = within(table).getByRole('button', { name: 'Edit product' });
  expect(action.closest('td')).toHaveAttribute('data-label', 'Actions');
  fireEvent.click(action);
  expect(edited).toBe(true);
});

it('keeps setup in one column after the final phone cascade', () => {
  const style = document.createElement('style');
  style.textContent = readFileSync('src/renderer/styles.css', 'utf8');
  document.head.append(style);
  try {
    style.textContent = Array.from(style.sheet!.cssRules).flatMap((rule) => rule instanceof CSSMediaRule
      ? rule.conditionText.match(/^\(max-width: (760|980|1100)px\)$/) ? Array.from(rule.cssRules).map((nested) => nested.cssText) : []
      : [rule.cssText]).join('\n');
    render(<div className="setup-page"><div className="setup-layout" data-testid="phone-setup-layout"><aside className="setup-welcome">Welcome</aside><div className="setup-panel"><div className="form-actions"><button>Back</button><button>Continue to opening stock</button></div></div></div></div>);
    expect(getComputedStyle(screen.getByTestId('phone-setup-layout')).gridTemplateColumns).toBe('1fr');
    expect(getComputedStyle(screen.getByRole('button', { name: 'Continue to opening stock' })).minHeight).toBe('44px');
  } finally { style.remove(); }
});

it('applies touch targets and wrapping cards at the phone breakpoint with safe-area space', () => {
  const style = document.createElement('style');
  style.textContent = readFileSync('src/renderer/styles.css', 'utf8');
  document.head.append(style);
  try {
    // JSDOM has no layout/media matching; apply the real phone media rules in source order.
    const rules = Array.from(style.sheet!.cssRules);
    style.textContent = rules.flatMap((rule) => rule instanceof CSSMediaRule
      ? rule.conditionText.match(/^\(max-width: (760|980|1100)px\)$/) ? Array.from(rule.cssRules).map((nested) => nested.cssText) : []
      : [rule.cssText]).join('\n');
    render(<div>
      <label className="form-field">Inventory status<select defaultValue="all"><option value="all">All stock</option></select></label>
      <label className="form-field compact-field">Report location<select defaultValue="cart"><option value="cart">Market Cart</option></select></label>
      <label className="form-field">Report date<input type="date" defaultValue="2026-10-15" /></label>
      <label className="form-field">Movement note<textarea /></label>
      <label className="form-field">Keep selection<input type="checkbox" /></label>
    </div>);
    for (const name of ['Inventory status', 'Report location', 'Report date', 'Movement note']) {
      const controlStyle = getComputedStyle(screen.getByLabelText(name));
      expect.soft(parseFloat(controlStyle.minHeight)).toBeGreaterThanOrEqual(44);
      expect.soft(parseFloat(controlStyle.minWidth)).toBeGreaterThanOrEqual(44);
    }
    expect(parseFloat(getComputedStyle(screen.getByLabelText('Keep selection')).minHeight) || 0).toBeLessThan(44);
    render(<><Harness /><div className="overview-page"><div className="overview-filters" data-testid="repeated-context">Page context</div></div><article className="metric-card" data-testid="quiet-metric">Sales</article><DataTable label="Phone cards" columns={[
      { key: 'name', label: 'Product', render: () => 'VeryLongProductName'.repeat(12) },
      { key: 'action', label: 'Actions', render: () => <button>Edit record</button> },
    ]} rows={['one']} rowKey={(row) => row} /></>);
    const rail = screen.getByRole('navigation', { name: 'Mobile primary' });
    for (const control of within(rail).getAllByRole('button')) {
      expect(parseFloat(getComputedStyle(control).minHeight)).toBeGreaterThanOrEqual(44);
      expect(parseFloat(getComputedStyle(control).minWidth)).toBeGreaterThanOrEqual(44);
    }
    expect(getComputedStyle(screen.getByRole('complementary', { hidden: true })).display).toBe('none');
    const table = screen.getByRole('table', { name: 'Phone cards' });
    expect(getComputedStyle(table).minWidth).toBe('0');
    expect(getComputedStyle(within(table).getAllByRole('cell')[0]).overflowWrap).toBe('anywhere');
    expect(getComputedStyle(within(table).getByRole('button')).display).not.toBe('none');
    expect(getComputedStyle(screen.getByTestId('repeated-context')).display).toBe('none');
    expect(getComputedStyle(screen.getByTestId('quiet-metric')).borderTopWidth).toBe('1px');
    const css = style.textContent;
    expect(css).toMatch(/padding-bottom:[^;]*env\(safe-area-inset-bottom/);
    expect(css).toMatch(/padding-(?:left|right):[^;]*env\(safe-area-inset-(?:left|right)/);
    expect(css).toMatch(/scroll-padding-bottom:[^;]*env\(safe-area-inset-bottom/);
    const reducedMotion = rules.find((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule && rule.conditionText === '(prefers-reduced-motion: reduce)')!;
    style.textContent += Array.from(reducedMotion.cssRules).map((rule) => rule.cssText).join('\n');
    fireEvent.click(within(rail).getByRole('button', { name: 'More' }));
    expect(getComputedStyle(screen.getByRole('dialog')).animation).toBe('none');
  } finally { style.remove(); }
});
