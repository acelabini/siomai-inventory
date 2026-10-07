import { useId, useState } from 'react';
import type { SaleReceipt as SaleReceiptData, SaleSummary } from '../../shared/schemas';
import { formatMoney, formatMovementTimestamp } from '../pages/stock-shared';
import DataTable from './DataTable';
import Button from './ui/Button';
import ConfirmDialog from './ui/ConfirmDialog';
import Field from './ui/Field';
import InlineNotice from './ui/InlineNotice';
import StatusBadge from './ui/StatusBadge';

export default function SaleReceipt({ receipt, onVoid, voiding = false }: { receipt: SaleReceiptData | SaleSummary; onVoid: (reason: string) => void | Promise<void>; voiding?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const receiptId = useId();
  const busy = pending || voiding;

  function cancel() { setConfirming(false); setReason(''); setError(''); }

  async function confirm() {
    if (!reason.trim() || busy) return;
    setPending(true); setError('');
    try { await onVoid(reason.trim()); cancel(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The sale could not be voided. Try again.'); }
    finally { setPending(false); }
  }

  return <section className="sale-receipt" aria-labelledby={`${receiptId}-title`}>
    <header className="sale-receipt-heading">
      <div><p className="eyebrow">Sale {receipt.id.slice(0, 8)}</p><h2 id={`${receiptId}-title`}>Receipt</h2><p className="receipt-time">{formatMovementTimestamp(receipt.businessAt)}</p></div>
      <StatusBadge tone={receipt.status === 'voided' ? 'danger' : 'success'}>{receipt.status === 'voided' ? 'Voided' : 'Completed'}</StatusBadge>
    </header>
    <DataTable label="Receipt items" className="receipt-table" columns={[
      { key: 'product', label: 'Product', render: (line) => line.productName },
      { key: 'quantity', label: 'Quantity', render: (line) => `${line.enteredQuantity} ${line.enteredUnit}${line.enteredQuantity === '1' ? '' : 's'}` },
      { key: 'total', label: 'Line total', numeric: true, render: (line) => formatMoney(line.lineRevenueCentavos) },
    ]} rows={receipt.lines.map((line, index) => ({ ...line, sourceIndex: index }))} rowKey={(line) => `${line.productId}:${line.sourceIndex}`} />
    <dl className="receipt-totals"><div><dt>Total</dt><dd>{formatMoney(receipt.totalCentavos)}</dd></div><div><dt>Paid</dt><dd>{formatMoney(receipt.paymentCentavos)}</dd></div><div><dt>Change</dt><dd>{formatMoney(receipt.changeCentavos)}</dd></div></dl>
    {receipt.note && <p className="receipt-note">Note: {receipt.note}</p>}
    {receipt.status === 'completed' && <div className="receipt-actions"><Button variant="ghost" className="receipt-void-button" onClick={() => { setConfirming(true); setError(''); }}>Void sale</Button></div>}
    <ConfirmDialog open={confirming} title="Void this sale?" description="Voiding restores each sold quantity to this location. Enter a reason to continue." confirmLabel={busy ? 'Voiding sale…' : 'Confirm void'} confirmDisabled={!reason.trim()} busy={busy} onCancel={cancel} onConfirm={() => { void confirm(); }}>
      <Field label="Reason" htmlFor={`${receiptId}-reason`} required hint="Explain why this sale is being voided."><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={busy} /></Field>
      {error && <InlineNotice tone="danger" title="Void sale needs attention">{error}</InlineNotice>}
    </ConfirmDialog>
  </section>;
}
