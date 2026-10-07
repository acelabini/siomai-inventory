import { useCallback, useEffect, useState } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import type { SaleReceipt as SaleReceiptData, SaleSummary } from '../../shared/schemas';
import { getInventoryApi } from '../api';
import SaleComposer from '../components/SaleComposer';
import SaleReceipt from '../components/SaleReceipt';
import DataTable from '../components/DataTable';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import InlineNotice from '../components/ui/InlineNotice';
import Panel from '../components/ui/Panel';
import StatusBadge from '../components/ui/StatusBadge';
import { formatMoney, formatMovementTimestamp } from './stock-shared';

export default function SalesPage({ api = getInventoryApi(), activeLocationId, onLocationChange }: { api?: InventoryApi; activeLocationId?: string; onLocationChange?: (locationId: string) => void }) {
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [selected, setSelected] = useState<SaleSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [availabilityRevision, setAvailabilityRevision] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setSales(await api.listSales(activeLocationId ? { locationId: activeLocationId } : undefined)); setError(''); }
    catch { setError('Sales history could not be loaded.'); }
    finally { setLoading(false); }
  }, [api, activeLocationId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function complete(receipt: SaleReceiptData) {
    setSelected(receipt);
    await refresh();
  }

  async function voidSale(receipt: SaleReceiptData | SaleSummary, reason: string) {
    const updated = await api.voidSale(receipt.id, reason);
    setSelected(updated);
    setAvailabilityRevision((current) => current + 1);
    await refresh();
  }

  return <>
    <SaleComposer api={api} activeLocationId={activeLocationId} onLocationChange={onLocationChange} onCompleted={(receipt) => { void complete(receipt); }} onVoid={voidSale} renderReceipt={false} availabilityRevision={availabilityRevision} />
    <section className="catalog-page sale-history" aria-label="Sales history">
      <Panel title="Recent sales" meta="Review receipts and void a completed sale when a correction is needed.">
        {error && <InlineNotice tone="danger" title="Sales history needs attention" action={<Button variant="secondary" onClick={() => { void refresh(); }}>Retry history</Button>}>{error}</InlineNotice>}
        <DataTable label="Recent sales" columns={[
          { key: 'time', label: 'Time', render: (sale) => formatMovementTimestamp(sale.businessAt) },
          { key: 'sale', label: 'Sale', render: (sale) => <span className="mono">{sale.id.slice(0, 8)}</span> },
          { key: 'status', label: 'Status', render: (sale) => <StatusBadge tone={sale.status === 'voided' ? 'danger' : 'success'}>{sale.status === 'voided' ? 'Voided' : 'Completed'}</StatusBadge> },
          { key: 'total', label: 'Total', numeric: true, render: (sale) => formatMoney(sale.totalCentavos) },
          { key: 'action', label: 'Action', render: (sale) => <Button variant="ghost" aria-label={`View receipt ${sale.id.slice(0, 8)}`} onClick={() => setSelected(sale)}>View receipt</Button> },
        ]} rows={sales} rowKey={(sale) => sale.id} empty={loading ? <p className="loading-note" role="status">Loading recent sales…</p> : <EmptyState icon="sale" title="No completed sales yet" description="Your receipts will appear here after completing a sale." />} />
      </Panel>
      {selected && <SaleReceipt receipt={selected} onVoid={(reason) => voidSale(selected, reason)} />}
    </section>
  </>;
}
