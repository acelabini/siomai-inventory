import { useEffect, useMemo, useState } from 'react';
import type { DashboardReport, InventoryApi } from '../../shared/contracts';
import type { CatalogLocation } from '../../shared/schemas';
import { getInventoryApi } from '../api';
import DataTable from '../components/DataTable';
import MetricCard from '../components/MetricCard';

function manilaToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const peso = (amount: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount / 100);

type SharedFilter = { locationId: string; date: string; locations: CatalogLocation[] };

export default function DashboardPage({ api = getInventoryApi(), onNavigate = () => undefined, filter, onFilterChange }: { api?: InventoryApi; onNavigate?: (page: string) => void; filter?: SharedFilter; onFilterChange?: (filter: { locationId: string; date: string }) => void }) {
  const [localLocations, setLocalLocations] = useState<CatalogLocation[]>([]);
  const [locationId, setLocationId] = useState('');
  const [date, setDate] = useState(manilaToday);
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [error, setError] = useState('');
  const locations = filter?.locations ?? localLocations;
  const selectedLocationId = filter?.locationId ?? locationId;
  const selectedDate = filter?.date ?? date;
  useEffect(() => { if (filter) return; let live = true; void api.listLocations().then((items) => { if (!live) return; setLocalLocations(items); setLocationId((current) => current || items[0]?.id || ''); }).catch(() => { if (live) setError('Locations could not be loaded.'); }); return () => { live = false; }; }, [api, filter]);
  useEffect(() => { if (!selectedDate || !locations.length) return; let live = true; setError(''); void api.getDashboard({ date: selectedDate, ...(selectedLocationId ? { locationId: selectedLocationId } : {}) }).then((value) => { if (live) setReport(value); }).catch(() => { if (live) setError('The daily ledger could not be loaded.'); }); return () => { live = false; }; }, [api, selectedDate, selectedLocationId, locations.length]);
  const selectedLocation = useMemo(() => locations.find((location) => location.id === selectedLocationId), [locations, selectedLocationId]);
  const updateLocation = (nextLocationId: string) => filter ? onFilterChange?.({ locationId: nextLocationId, date: selectedDate }) : setLocationId(nextLocationId);
  const updateDate = (nextDate: string) => filter ? onFilterChange?.({ locationId: selectedLocationId, date: nextDate }) : setDate(nextDate);
  return <section className="ledger-page" aria-labelledby="page-title">
    <div className="page-heading dashboard-heading">
      <div><p className="eyebrow">{selectedLocation?.name ?? 'Daily operations'}</p><h1 id="page-title">Today’s ledger</h1></div>
      <div className="filter-row">
        <label className="form-field compact-field">Location<select aria-label="Dashboard location" value={selectedLocationId} onChange={(event) => updateLocation(event.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label className="form-field compact-field">Business date<input aria-label="Dashboard business date" type="date" value={selectedDate} onChange={(event) => updateDate(event.target.value)} /></label>
      </div>
    </div>
    <section className="ledger-ribbon" aria-label="Daily activity summary">
      <span className="table-subtitle">Activity summary, not a full stock reconciliation. Transfers, count adjustments, and voided-sale restocks are not shown here.</span>
      <span>Opening <strong>{report?.products.reduce((sum, row) => sum + row.openingPieces, 0) ?? '—'} pc</strong></span><span aria-hidden="true">→</span>
      <span>Replenished <strong>{report?.products.reduce((sum, row) => sum + row.replenishedPieces, 0) ?? '—'} pc</strong></span><span aria-hidden="true">→</span>
      <span>Sold <strong>{report?.products.reduce((sum, row) => sum + row.soldPieces, 0) ?? '—'} pc</strong></span><span aria-hidden="true">→</span>
      <strong>On hand <span className="mono">{report?.products.reduce((sum, row) => sum + row.remainingPieces, 0) ?? '—'} pc</span></strong>
    </section>
    {error && <p className="field-error" role="alert">{error}</p>}
    {!report ? <p role="status" className="loading-note">Loading daily ledger…</p> : <>
      <section className="metric-grid" aria-label="Daily summary">
        <MetricCard label="Revenue" value={peso(report.metrics.revenueCentavos)} />
        <MetricCard label="Gross profit" value={peso(report.metrics.grossProfitCentavos)} />
        <MetricCard label="Stock value" value={peso(report.metrics.stockValueCentavos)} detail="At current product cost" />
        <MetricCard label="Discrepancies" value={String(report.metrics.discrepancyCount)} tone={report.metrics.discrepancyCount ? 'warning' : 'default'} />
        <MetricCard label="Low stock" value={String(report.metrics.lowStockCount)} tone={report.metrics.lowStockCount ? 'warning' : 'default'} />
      </section>
      <DataTable label="Daily inventory ledger" rows={report.products} rowKey={(row) => row.productId} columns={[
        { key: 'product', label: 'Product', render: (row) => <><strong>{row.productName}</strong><small className="table-subtitle mono">{row.sku}</small></> },
        { key: 'opening', label: 'Opening', numeric: true, render: (row) => row.openingPieces },
        { key: 'in', label: 'Replenished', numeric: true, render: (row) => row.replenishedPieces },
        { key: 'sold', label: 'Sold', numeric: true, render: (row) => row.soldPieces },
        { key: 'hand', label: 'On hand', numeric: true, render: (row) => <>{row.remainingPieces}{row.isLowStock && <span className="low-stock-tag" aria-label="Low stock">⚠ Low stock</span>}</> },
        { key: 'value', label: 'Value', numeric: true, render: (row) => peso(row.stockValueCentavos) },
      ]} empty={<div className="dashboard-empty"><strong>No stock recorded for this date.</strong><span>Reconcile physical stock against the current records, or add your product list.</span><div><button type="button" className="secondary-button" onClick={() => onNavigate('Stock count')}>Reconcile stock count</button><button type="button" className="primary-button" onClick={() => onNavigate('Products')}>Add products</button></div></div>} />
    </>}
  </section>;
}
