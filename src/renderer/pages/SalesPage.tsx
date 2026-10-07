import { useCallback, useEffect, useState } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import type { SaleReceipt as SaleReceiptData, SaleSummary } from '../../shared/schemas';
import { getInventoryApi } from '../api';
import SaleComposer from '../components/SaleComposer';
import SaleReceipt from '../components/SaleReceipt';
import { formatMoney, formatMovementTimestamp } from './stock-shared';

export default function SalesPage({ api = getInventoryApi(), activeLocationId, onLocationChange }: { api?: InventoryApi; activeLocationId?: string; onLocationChange?: (locationId: string) => void }) {
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [selected, setSelected] = useState<SaleSummary | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try { setSales(await api.listSales(activeLocationId ? { locationId: activeLocationId } : undefined)); setError(''); }
    catch { setError('Sales history could not be loaded.'); }
  }, [api, activeLocationId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function complete(receipt: SaleReceiptData) {
    setSelected(receipt);
    await refresh();
  }

  async function voidSale(receipt: SaleReceiptData | SaleSummary, reason: string) {
    const updated = await api.voidSale(receipt.id, reason);
    setSelected(updated);
    await refresh();
  }

  return <>
    <SaleComposer api={api} activeLocationId={activeLocationId} onLocationChange={onLocationChange} onCompleted={(receipt) => { void complete(receipt); }} onVoid={voidSale} renderReceipt={false} />
    <section className="catalog-page sale-history" aria-labelledby="sales-history-title">
      <div className="page-heading"><div><p className="eyebrow">TRANSACTION LOG</p><h2 id="sales-history-title">Recent sales</h2></div></div>
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Time</th><th>Sale</th><th>Status</th><th>Total</th><th>Action</th></tr></thead><tbody>
        {sales.map((sale) => <tr key={sale.id}><td>{formatMovementTimestamp(sale.businessAt)}</td><td className="mono">{sale.id.slice(0, 8)}</td><td>{sale.status}</td><td>{formatMoney(sale.totalCentavos)}</td><td><button className="text-button" type="button" onClick={() => setSelected(sale)}>View receipt</button></td></tr>)}
      </tbody></table>{sales.length === 0 && <p className="empty-note">No completed sales yet.</p>}</div>
      {selected && <SaleReceipt receipt={selected} onVoid={(reason) => voidSale(selected, reason)} />}
    </section>
  </>;
}
