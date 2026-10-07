// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '../../src/renderer/pages/stock-shared';
import AppIcon from '../../src/renderer/components/ui/AppIcon';
import Button from '../../src/renderer/components/ui/Button';
import Field from '../../src/renderer/components/ui/Field';
import ConfirmDialog from '../../src/renderer/components/ui/ConfirmDialog';
import MetricCard from '../../src/renderer/components/MetricCard';
import DataTable from '../../src/renderer/components/DataTable';
import PageHeader from '../../src/renderer/components/ui/PageHeader';
import { readFileSync } from 'node:fs';

const rendererStyles = readFileSync('src/renderer/styles.css', 'utf8');

afterEach(cleanup);

describe('accessible UI primitives', () => {
  it('renders button variants with accessible icons', () => {
    render(<>
      <Button variant="primary" icon="plus">New sale</Button>
      <Button variant="secondary" icon="download">Export CSV</Button>
      <Button variant="ghost" icon="help" aria-label="Help" title="Help" />
      <Button variant="danger" icon="trash" busy>Archiving product…</Button>
      <AppIcon name="check" decorative={false} label="Completed" />
    </>);
    expect(screen.getByRole('button', { name: 'New sale' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Help' })).toHaveAttribute('title', 'Help');
    expect(screen.getByRole('button', { name: 'Archiving product…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Archiving product…' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('img', { name: 'Completed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New sale' }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('connects field errors to controls', () => {
    render(<Field label="Counted quantity" htmlFor="count" hint="Enter pieces." error="Enter a whole number." required>
      <input id="count" type="number" aria-describedby="external-hint" />
    </Field>);
    const control = screen.getByRole('spinbutton', { name: /Counted quantity/ });
    expect(control).toBeRequired();
    expect(control).toHaveAttribute('aria-invalid', 'true');
    const descriptions = control.getAttribute('aria-describedby')!.split(' ');
    expect(descriptions).toContain('external-hint');
    expect(descriptions.slice(1).map((id) => document.getElementById(id)?.textContent)).toEqual(['Enter pieces.', 'Enter a whole number.']);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number.');
  });

  it('labels metric and table edge values', () => {
    render(<>
      <MetricCard label="Stock value" value={formatMoney(999999999)} detail="At purchase cost" comparison="Compared with yesterday" tone="positive" />
      <DataTable label="Stock discrepancies" className="variance-table" columns={[
        { key: 'name', label: 'Product', render: (row: { id: string; name: string; quantity: string }) => row.name },
        { key: 'quantity', label: 'Variance', numeric: true, render: (row) => row.quantity },
      ]} rows={[{ id: 'zero', name: 'Pork', quantity: '0 pc' }, { id: 'negative', name: 'Beef', quantity: '−2 pc' }]} rowKey={(row) => row.id} />
    </>);
    expect(screen.getByRole('article', { name: 'Stock value' })).toHaveTextContent('₱9,999,999.99');
    expect(screen.getByText('Compared with yesterday')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Stock discrepancies' });
    expect(within(table).getByRole('cell', { name: '0 pc' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '−2 pc' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Stock discrepancies' })).toHaveAttribute('tabindex', '0');
  });

  it('traps and restores focus in confirm dialog', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      return <>
        <Button variant="danger" onClick={() => setOpen(true)}>Void sale</Button>
        <ConfirmDialog open={open} title="Void this sale?" description="Stock will be returned." confirmLabel="Confirm void" variant="danger"
          onConfirm={onConfirm} onCancel={() => { onCancel(); setOpen(false); }}>
          <Field label="Reason" htmlFor="reason"><input id="reason" /></Field>
        </ConfirmDialog>
      </>;
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Void sale' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Void this sale?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Stock will be returned.');
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveFocus();
    const first = within(dialog).getByRole('textbox', { name: 'Reason' });
    const last = within(dialog).getByRole('button', { name: 'Confirm void' });
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();
    trigger.focus();
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('keeps dialog focus stable while editing and cancels only when safe', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const props = { open: true, title: 'Restore backup?', description: 'The selected backup replaces current data.', confirmLabel: 'Restore backup', variant: 'primary' as const, onConfirm, onCancel };
    const { rerender } = render(<ConfirmDialog {...props}><input aria-label="Backup name" defaultValue="cart.sqlite" /></ConfirmDialog>);
    const confirm = screen.getByRole('button', { name: 'Restore backup' });
    expect(confirm).toHaveFocus();
    const input = screen.getByRole('textbox', { name: 'Backup name' });
    input.focus();
    fireEvent.change(input, { target: { value: 'market.sqlite' } });
    rerender(<ConfirmDialog {...props} onCancel={() => onCancel()}><input aria-label="Backup name" defaultValue="cart.sqlite" /></ConfirmDialog>);
    expect(input).toHaveFocus();
    expect(input).toHaveValue('market.sqlite');
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
    rerender(<ConfirmDialog {...props} busy />);
    expect(confirm).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(screen.getByRole('dialog')).toHaveFocus();
    rerender(<ConfirmDialog {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it.each([
    ['disabled tabindex', <input key="disabled" aria-label="Unavailable" disabled tabIndex={0} />],
    ['disabled fieldset', <fieldset key="fieldset" disabled><input aria-label="Unavailable" tabIndex={0} /></fieldset>],
    ['display none ancestor', <div key="display" style={{ display: 'none' }}><input aria-label="Unavailable" /></div>],
    ['visibility hidden ancestor', <div key="visibility" style={{ visibility: 'hidden' }}><input aria-label="Unavailable" /></div>],
    ['hidden ancestor', <div key="hidden" hidden><input aria-label="Unavailable" /></div>],
    ['inert ancestor', <div key="inert" inert><input aria-label="Unavailable" /></div>],
  ])('skips %s controls when wrapping dialog focus', (_scenario, unavailable) => {
    render(<ConfirmDialog open title="Confirm change" description="Review the action." confirmLabel="Confirm" onConfirm={vi.fn()} onCancel={vi.fn()}>
      {unavailable}
      <input aria-label="Available" />
    </ConfirmDialog>);
    const available = screen.getByRole('textbox', { name: 'Available' });
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(available).toHaveFocus();
    fireEvent.keyDown(available, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
  });

  it('gives idle field borders and page eyebrows accessible contrast', () => {
    const style = document.createElement('style');
    style.textContent = rendererStyles;
    document.head.append(style);
    try {
      render(<>
        <PageHeader eyebrow="Stock operations" title="Replenish" titleId="contrast-title" />
        <Field label="Quantity" htmlFor="contrast-quantity"><input id="contrast-quantity" /></Field>
      </>);
      const root = getComputedStyle(document.documentElement);
      function resolveTokens(value: string): string {
        return value.replace(/var\((--[\w-]+)\)/g, (_match, token: string) => {
          return resolveTokens(root.getPropertyValue(token).trim());
        });
      }
      // JSDOM does not resolve variables in CSS shorthands; apply resolved styles
      // before checking the rendered controls' colors and contrast thresholds.
      style.textContent = resolveTokens(rendererStyles);
      function luminance(color: string): number {
        const resolved = resolveTokens(color);
        const channels = resolved.startsWith('#')
          ? [1, 3, 5].map((offset) => parseInt(resolved.slice(offset, offset + 2), 16))
          : resolved.match(/[\d.]+/g)!.slice(0, 3).map(Number);
        const linear = channels.map((value) => value / 255 <= .04045 ? value / 255 / 12.92 : ((value / 255 + .055) / 1.055) ** 2.4);
        return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
      }
      function contrast(foreground: string, background: string): number {
        const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
        return (values[0] + .05) / (values[1] + .05);
      }
      const controlStyle = getComputedStyle(screen.getByRole('textbox', { name: 'Quantity' }));
      expect.soft(contrast(controlStyle.borderTopColor, controlStyle.backgroundColor)).toBeGreaterThanOrEqual(3);
      const eyebrowStyle = getComputedStyle(screen.getByText('Stock operations'));
      for (const surface of ['--rice-paper', '--market-canvas']) {
        expect.soft(contrast(eyebrowStyle.color, root.getPropertyValue(surface))).toBeGreaterThanOrEqual(4.5);
      }
    } finally {
      style.remove();
    }
  });
});
