import { useState } from 'react';
import type { SaleReceipt as SaleReceiptData, SaleSummary } from '../../shared/schemas';
import { formatMoney } from '../pages/stock-shared';

export default function SaleReceipt({ receipt, onVoid, voiding = false }: { receipt: SaleReceiptData | SaleSummary; onVoid: (reason: string) => void | Promise<void>; voiding?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  return <section className="sale-receipt" aria-labelledby="receipt-title">
    <div className="page-heading"><div><p className="eyebrow">{receipt.status === 'voided' ? 'VOIDED SALE' : 'COMPLETED SALE'}</p><h2 id="receipt-title">Receipt</h2></div><span className="mono">{receipt.id.slice(0, 8)}</span></div>
    <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Product</th><th>Quantity</th><th>Line total</th></tr></thead><tbody>
      {receipt.lines.map((line, index) => <tr key={`${line.productId}:${index}`}><td>{line.productName}</td><td>{line.enteredQuantity} {line.enteredUnit}{line.enteredQuantity === '1' ? '' : 's'}</td><td>{formatMoney(line.lineRevenueCentavos)}</td></tr>)}
    </tbody></table></div>
    <dl className="receipt-totals"><div><dt>Total</dt><dd>{formatMoney(receipt.totalCentavos)}</dd></div><div><dt>Paid</dt><dd>{formatMoney(receipt.paymentCentavos)}</dd></div><div><dt>Change</dt><dd>{formatMoney(receipt.changeCentavos)}</dd></div></dl>
    {receipt.status === 'completed' && !confirming && <button className="text-button destructive" type="button" onClick={() => setConfirming(true)}>Void sale</button>}
    {confirming && <form className="void-confirmation" onSubmit={(event) => { event.preventDefault(); if (reason.trim()) void onVoid(reason.trim()); }}>
      <p className="discrepancy-text">Voiding restores each sold quantity to this location. Enter a reason to continue.</p>
      <label className="form-field">Reason<input aria-label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></label>
      <div className="form-actions"><button className="secondary-button" type="button" onClick={() => { setConfirming(false); setReason(''); }}>Keep sale</button><button className="primary-button destructive-button" type="submit" disabled={!reason.trim() || voiding}>{voiding ? 'Voiding…' : 'Confirm void'}</button></div>
    </form>}
  </section>;
}
