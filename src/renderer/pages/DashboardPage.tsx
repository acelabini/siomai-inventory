import { useEffect, useMemo, useState } from 'react';
import type { DashboardReport, InventoryApi } from '../../shared/contracts';
import type { CatalogLocation, StockMovement } from '../../shared/schemas';
import { getInventoryApi } from '../api';
import DataTable from '../components/DataTable';
import MetricCard from '../components/MetricCard';
import AppIcon from '../components/ui/AppIcon';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import InlineNotice from '../components/ui/InlineNotice';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatusBadge from '../components/ui/StatusBadge';

function manilaToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const peso = (amount: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount / 100);

type SharedFilter = { locationId: string; date: string; locations: CatalogLocation[] };
export type DashboardActivityItem = { id: string; kind: 'sale' | 'movement'; occurredAt: string; title: string; detail: string };
const utcTimestamp = (value: string) => `${value.replace(' ', 'T')}Z`;
const manilaDateTime = (value: string) => new Date(utcTimestamp(value)).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
const movementTitles: Record<StockMovement['movementType'], string> = {
  opening_balance: 'Opening balance', replenishment: 'Replenishment', transfer_in: 'Transfer in',
  transfer_out: 'Transfer out', count_adjustment: 'Count adjustment', sale: 'Sale', sale_void: 'Sale void',
};

export default function DashboardPage({ api = getInventoryApi(), onNavigate = () => undefined, filter, onFilterChange }: { api?: InventoryApi; onNavigate?: (page: string) => void; filter?: SharedFilter; onFilterChange?: (filter: { locationId: string; date: string }) => void }) {
  const [localLocations, setLocalLocations] = useState<CatalogLocation[]>([]);
  const [locationId, setLocationId] = useState('');
  const [date, setDate] = useState(manilaToday);
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [error, setError] = useState('');
  const [activity, setActivity] = useState<DashboardActivityItem[] | null>(null);
  const [activityError, setActivityError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const locations = filter?.locations ?? localLocations;
  const selectedLocationId = filter?.locationId ?? locationId;
  const selectedDate = filter?.date ?? date;
  useEffect(() => { if (filter) return; let live = true; void api.listLocations().then((items) => { if (!live) return; setLocalLocations(items); setLocationId((current) => current || items[0]?.id || ''); }).catch(() => { if (live) setError('Locations could not be loaded. Try loading the overview again.'); }); return () => { live = false; }; }, [api, filter, refreshKey]);
  useEffect(() => {
    if (!selectedDate || !locations.length) return;
    let live = true;
    setError(''); setReport(null);
    void api.getDashboard({ date: selectedDate, ...(selectedLocationId ? { locationId: selectedLocationId } : {}) })
      .then((value) => { if (live) setReport(value); })
      .catch(() => { if (live) setError('The daily ledger could not be loaded. Check the location and date, then try again.'); });
    return () => { live = false; };
  }, [api, selectedDate, selectedLocationId, locations.length, refreshKey]);
  useEffect(() => {
    if (!locations.length) return;
    let live = true;
    setActivity(null); setActivityError('');
    const query = { ...(selectedLocationId ? { locationId: selectedLocationId } : {}), limit: 4 };
    void Promise.all([api.listSales(query), api.getMovementHistory(query)]).then(([sales, movements]) => {
      if (!live) return;
      const items: DashboardActivityItem[] = [
        ...sales.map((sale): DashboardActivityItem => ({ id: `sale-${sale.id}`, kind: 'sale', occurredAt: sale.businessAt, title: sale.status === 'voided' ? 'Voided sale' : 'Completed sale', detail: `${peso(sale.totalCentavos)} · Sale ${sale.id.slice(0, 8)}` })),
        ...movements.map((movement): DashboardActivityItem => ({ id: `movement-${movement.id}`, kind: 'movement', occurredAt: movement.occurredAt, title: movementTitles[movement.movementType], detail: `${movement.productName} · ${movement.quantityPieces} pc` })),
      ];
      setActivity(items.sort((a, b) => new Date(utcTimestamp(b.occurredAt)).valueOf() - new Date(utcTimestamp(a.occurredAt)).valueOf()).slice(0, 4));
    }).catch(() => { if (live) setActivityError('Recent activity could not be loaded. Try loading the overview again.'); });
    return () => { live = false; };
  }, [api, selectedLocationId, locations.length, refreshKey]);
  const selectedLocation = useMemo(() => locations.find((location) => location.id === selectedLocationId), [locations, selectedLocationId]);
  const updateLocation = (nextLocationId: string) => filter ? onFilterChange?.({ locationId: nextLocationId, date: selectedDate }) : setLocationId(nextLocationId);
  const updateDate = (nextDate: string) => filter ? onFilterChange?.({ locationId: selectedLocationId, date: nextDate }) : setDate(nextDate);
  const stockNeedsAttention = !!report && (report.metrics.lowStockCount > 0 || report.metrics.discrepancyCount > 0);
  return <section className="ledger-page overview-page" aria-labelledby="page-title">
    <PageHeader eyebrow={selectedLocation?.name ?? 'Daily operations'} title="Today at a glance" titleId="page-title"
      description={`Sales and inventory for ${selectedDate}.`} actions={<div className="filter-row overview-filters">
        <label className="form-field compact-field">Location<select aria-label="Dashboard location" value={selectedLocationId} onChange={(event) => updateLocation(event.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label className="form-field compact-field">Business date<input aria-label="Dashboard business date" type="date" value={selectedDate} onChange={(event) => updateDate(event.target.value)} /></label>
      </div>} />
    {error && <InlineNotice tone="danger" title="Overview could not be loaded" action={<Button variant="secondary" onClick={() => setRefreshKey((value) => value + 1)}>Try again</Button>}>{error}</InlineNotice>}
    {!report ? !error && <p role="status" className="loading-note">Loading daily ledger…</p> : <>
      <section className="metric-grid overview-metrics" aria-label="Daily summary">
        <MetricCard label="Sales" value={peso(report.metrics.revenueCentavos)} detail="Completed sales revenue" />
        <MetricCard label="Gross profit" value={peso(report.metrics.grossProfitCentavos)} />
        <MetricCard label="Items sold" value={`${report.products.reduce((sum, row) => sum + row.soldPieces, 0)} pc`} />
        <MetricCard label="Stock value" value={peso(report.metrics.stockValueCentavos)} detail="At current product cost" />
      </section>
      {stockNeedsAttention ? <InlineNotice tone="warning" title="Stock needs attention" action={<div className="attention-actions">
        {report.metrics.lowStockCount > 0 && <Button variant="secondary" icon="inventory" onClick={() => onNavigate('Inventory')}>View low stock</Button>}
        {report.metrics.discrepancyCount > 0 && <Button variant="secondary" icon="count" onClick={() => onNavigate('Stock count')}>Review discrepancies</Button>}
      </div>}>
        {report.metrics.lowStockCount} low-stock {report.metrics.lowStockCount === 1 ? 'product' : 'products'} · {report.metrics.discrepancyCount} {report.metrics.discrepancyCount === 1 ? 'discrepancy' : 'discrepancies'}. Review stock before the next service.
      </InlineNotice> : <section className="stock-check-summary" aria-label="Stock checks">
        <StatusBadge tone="success">All clear</StatusBadge>
        <dl><div><dt>Low stock</dt><dd>0</dd></div><div><dt>Discrepancies</dt><dd>0</dd></div></dl>
      </section>}
      <Panel title="Inventory snapshot" meta="Opening stock, replenishments, and sales for the selected day." className="overview-inventory">
        <section className="ledger-ribbon" aria-label="Daily activity summary">
          <span className="table-subtitle">Activity summary, not a full stock reconciliation. Transfers, count adjustments, and voided-sale restocks are not shown here.</span>
          <span>Opening <strong>{report.products.reduce((sum, row) => sum + row.openingPieces, 0)} pc</strong></span>
          <span>Replenished <strong>{report.products.reduce((sum, row) => sum + row.replenishedPieces, 0)} pc</strong></span>
          <span>Sold <strong>{report.products.reduce((sum, row) => sum + row.soldPieces, 0)} pc</strong></span>
          <strong>On hand <span className="mono">{report.products.reduce((sum, row) => sum + row.remainingPieces, 0)} pc</span></strong>
        </section>
        <DataTable label="Daily inventory ledger" rows={report.products} rowKey={(row) => row.productId} columns={[
        { key: 'product', label: 'Product', render: (row) => <><strong>{row.productName}</strong><small className="table-subtitle mono">{row.sku}</small></> },
        { key: 'opening', label: 'Opening', numeric: true, render: (row) => row.openingPieces },
        { key: 'in', label: 'Replenished', numeric: true, render: (row) => row.replenishedPieces },
        { key: 'sold', label: 'Sold', numeric: true, render: (row) => row.soldPieces },
        { key: 'hand', label: 'On hand', numeric: true, render: (row) => row.remainingPieces },
        { key: 'status', label: 'Status', render: (row) => <StatusBadge tone={row.isLowStock ? 'warning' : 'success'}>{row.isLowStock ? 'Low stock' : 'Healthy'}</StatusBadge> },
        { key: 'value', label: 'Value', numeric: true, render: (row) => peso(row.stockValueCentavos) },
        ]} empty={<EmptyState icon="inventory" title="No stock recorded for this date." description="Reconcile physical stock against the current records, or add your product list." actions={<>
          <Button variant="secondary" icon="count" onClick={() => onNavigate('Stock count')}>Reconcile stock count</Button>
          <Button variant="primary" icon="plus" onClick={() => onNavigate('Products')}>Add products</Button>
        </>} />} />
      </Panel>
      <Panel title="Recent activity" meta="Latest sales and stock movements at this location, across business dates." className="overview-activity">
        {activityError ? <InlineNotice tone="danger" title="Recent activity unavailable" action={<Button variant="secondary" onClick={() => setRefreshKey((value) => value + 1)}>Try again</Button>}>{activityError}</InlineNotice>
          : !activity ? <p role="status" className="loading-note">Loading recent activity…</p>
            : activity.length ? <ol className="activity-list" aria-label="Recent activity">{activity.map((item) => <li key={item.id}>
              <span className="activity-icon"><AppIcon name={item.kind === 'sale' ? 'sale' : 'inventory'} /></span>
              <div><strong className="activity-title">{item.title}</strong><p>{item.detail}</p></div>
              <time dateTime={utcTimestamp(item.occurredAt)}>{manilaDateTime(item.occurredAt)}</time>
            </li>)}</ol> : <EmptyState icon="overview" title="No recent activity yet" description="Completed sales and recorded stock movements will appear here." />}
      </Panel>
    </>}
  </section>;
}
