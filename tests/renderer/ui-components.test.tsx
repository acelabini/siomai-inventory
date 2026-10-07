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
});
