import { useEffect, useState } from 'react';
import type { DiscrepancyReport, InventoryApi, LowStockReport, MovementReport, ProfitReport, SalesReport, ValuationReport } from '../../shared/contracts';
import type { CatalogLocation } from '../../shared/schemas';
import { getInventoryApi } from '../api';
import { utcTimestamp } from '../time';
import DataTable from '../components/DataTable';
import MetricCard from '../components/MetricCard';
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
const signedPieces = (pieces: number) => `${pieces < 0 ? '−' : pieces > 0 ? '+' : ''}${Math.abs(pieces)} pc`;
const manilaDateTime = (value: string) => new Date(utcTimestamp(value)).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
type SharedFilter = { locationId: string; date: string; locations: CatalogLocation[] };
type ReportKind = 'profit' | 'sales' | 'movements' | 'valuation' | 'discrepancies' | 'low-stock';
type ReportData = { sales: SalesReport; movements: MovementReport; valuation: ValuationReport; profit: ProfitReport; discrepancies: DiscrepancyReport; lowStock: LowStockReport };
const reportLabels: Record<ReportKind, string> = { profit: 'Profit', sales: 'Sales', movements: 'Stock movements', valuation: 'Stock valuation', discrepancies: 'Discrepancies', 'low-stock': 'Low stock' };

function FocusedReport({ kind, data }: { kind: ReportKind; data: ReportData }) {
  const { profit, sales, movements, valuation, discrepancies, lowStock } = data;
  const empty = (title: string, description: string) => <EmptyState icon="reports" title={title} description={description} />;
  const metrics = (items: Array<{ label: string; value: string; detail?: string }>) => <section className="metric-grid report-metrics" aria-label="Report summary">
    {items.map((item) => <MetricCard key={item.label} {...item} />)}
  </section>;

  switch (kind) {
    case 'profit': return <>
      {metrics([{ label: 'Revenue', value: peso(profit.revenueCentavos) }, { label: 'Cost', value: peso(profit.costCentavos) }, { label: 'Gross profit', value: peso(profit.grossProfitCentavos) }])}
      <Panel title="Profit" meta="Revenue and recorded cost from completed sales.">
        <p className="report-note">Gross profit is sales revenue minus recorded sale cost.</p>
        <DataTable label="Profit summary" rows={[profit]} rowKey={(row) => row.date} columns={[
          { key: 'revenue', label: 'Revenue', numeric: true, render: (row) => peso(row.revenueCentavos) },
          { key: 'cost', label: 'Cost', numeric: true, render: (row) => peso(row.costCentavos) },
          { key: 'profit', label: 'Gross profit', numeric: true, render: (row) => peso(row.grossProfitCentavos) },
        ]} />
      </Panel>
    </>;
    case 'sales': return <>
      {metrics([{ label: 'Revenue', value: peso(sales.sales.reduce((sum, row) => sum + row.totalCentavos, 0)) }, { label: 'Cost', value: peso(sales.sales.reduce((sum, row) => sum + row.costCentavos, 0)) }, { label: 'Gross profit', value: peso(sales.sales.reduce((sum, row) => sum + row.grossProfitCentavos, 0)) }])}
      <Panel title="Sales" meta={`${sales.sales.length} completed ${sales.sales.length === 1 ? 'sale' : 'sales'} on the selected date.`}>
        <DataTable label="Sales report" rows={sales.sales} rowKey={(row) => row.id} columns={[
          { key: 'time', label: 'Recorded at', render: (row) => manilaDateTime(row.businessAt) },
          { key: 'sale', label: 'Sale', render: (row) => row.id.slice(0, 8) },
          { key: 'revenue', label: 'Revenue', numeric: true, render: (row) => peso(row.totalCentavos) },
          { key: 'cost', label: 'Cost', numeric: true, render: (row) => peso(row.costCentavos) },
          { key: 'profit', label: 'Gross profit', numeric: true, render: (row) => peso(row.grossProfitCentavos) },
        ]} empty={empty('No completed sales for this date', 'Choose another location or date, or complete a sale to add a sales record.')} />
      </Panel>
    </>;
    case 'movements': return <>
      {metrics([{ label: 'Movements', value: String(movements.movements.length) }, { label: 'Products moved', value: String(new Set(movements.movements.map((row) => row.productId)).size) }])}
      <Panel title="Stock movements" meta="Recorded stock changes for the selected date.">
        <DataTable label="Stock movement report" rows={movements.movements} rowKey={(row) => row.id} columns={[
          { key: 'time', label: 'Time', render: (row) => new Date(utcTimestamp(row.occurredAt)).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' }) },
          { key: 'product', label: 'Product', render: (row) => row.productName },
          { key: 'type', label: 'Movement', render: (row) => row.movementType.replaceAll('_', ' ') },
          { key: 'quantity', label: 'Pieces', numeric: true, render: (row) => row.quantityPieces },
        ]} empty={empty('No stock movements for this date', 'Choose another location or date, or record a stock operation to see its movement.')} />
      </Panel>
    </>;
    case 'valuation': return <>
      {metrics([{ label: 'Stock value', value: peso(valuation.totalValueCentavos), detail: 'At current product cost' }, { label: 'On hand', value: `${valuation.items.reduce((sum, row) => sum + row.quantityPieces, 0)} pc` }])}
      <Panel title="Stock valuation" meta="On-hand stock valued at current purchase cost.">
        <p className="report-note">Valuation uses the current product purchase cost for stock on the selected date; historical product costs are not stored.</p>
        <DataTable label="Stock valuation details" rows={valuation.items} rowKey={(row) => `${row.locationId}-${row.productId}`} columns={[
          { key: 'product', label: 'Product', render: (row) => row.productName },
          { key: 'pieces', label: 'On hand', numeric: true, render: (row) => row.quantityPieces },
          { key: 'value', label: 'Stock value', numeric: true, render: (row) => peso(row.valueCentavos) },
        ]} empty={empty('No stock to value for this date', 'Choose another location or date, or record opening stock or a replenishment.')} />
      </Panel>
    </>;
    case 'discrepancies': return <>
      {metrics([{ label: 'Discrepancies', value: String(discrepancies.count) }, { label: 'Net variance', value: signedPieces(discrepancies.items.reduce((sum, row) => sum + row.differencePieces, 0)) }])}
      <Panel title="Stock count discrepancies" meta="Recorded differences between expected and counted stock.">
        <p className="report-note">Negative variance means fewer pieces were counted; positive variance means extra pieces were counted.</p>
        <DataTable label="Stock count discrepancies" rows={discrepancies.items} rowKey={(row) => `${row.countedAt}-${row.locationId}-${row.productId}`} columns={[
          { key: 'time', label: 'Counted at', render: (row) => manilaDateTime(row.countedAt) },
          { key: 'product', label: 'Product', render: (row) => row.productName },
          { key: 'expected', label: 'Expected', numeric: true, render: (row) => row.expectedPieces },
          { key: 'counted', label: 'Counted', numeric: true, render: (row) => row.countedPieces },
          { key: 'difference', label: 'Variance', numeric: true, render: (row) => <StatusBadge tone={row.differencePieces === 0 ? 'neutral' : 'danger'}>{signedPieces(row.differencePieces)}</StatusBadge> },
        ]} empty={empty('No discrepancies recorded for this date', 'Stock counts with a difference will appear here. Choose another location or date to review earlier counts.')} />
      </Panel>
    </>;
    case 'low-stock': return <>
      {metrics([{ label: 'Low stock', value: String(lowStock.count) }, { label: 'Pieces on hand', value: `${lowStock.items.reduce((sum, row) => sum + row.quantityPieces, 0)} pc`, detail: 'Across low-stock products' }])}
      <Panel title="Low stock" meta="Products at or below their stock threshold.">
        <DataTable label="Low stock details" rows={lowStock.items} rowKey={(row) => `${row.locationId}-${row.productId}`} columns={[
          { key: 'product', label: 'Product', render: (row) => <><strong>{row.productName}</strong><StatusBadge tone="warning">Low stock</StatusBadge></> },
          { key: 'quantity', label: 'On hand', numeric: true, render: (row) => row.quantityPieces },
          { key: 'threshold', label: 'Threshold', numeric: true, render: (row) => row.lowStockThresholdPieces },
        ]} empty={empty('No low-stock products for this date', 'All reported products are above their low-stock threshold. Choose another location or date to review its stock.')} />
      </Panel>
    </>;
  }
}

export default function ReportsPage({ api = getInventoryApi(), filter, onFilterChange }: { api?: InventoryApi; filter?: SharedFilter; onFilterChange?: (filter: { locationId: string; date: string }) => void }) {
  const [localLocations, setLocalLocations] = useState<CatalogLocation[]>([]);
  const [locationId, setLocationId] = useState('');
  const [date, setDate] = useState(manilaToday);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState('');
  const [reportKind, setReportKind] = useState<ReportKind>('profit');
  const [exportMessage, setExportMessage] = useState('');
  const [exportError, setExportError] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const locations = filter?.locations ?? localLocations;
  const selectedLocationId = filter?.locationId ?? locationId;
  const selectedDate = filter?.date ?? date;
  useEffect(() => { if (filter) return; let live = true; void api.listLocations().then((items) => { if (live) { setLocalLocations(items); setLocationId((current) => current || items[0]?.id || ''); } }).catch(() => { if (live) setError('Locations could not be loaded. Try loading reports again.'); }); return () => { live = false; }; }, [api, filter, refreshKey]);
  useEffect(() => {
    if (!selectedDate || !locations.length) return;
    let live = true; setError(''); setData(null);
    const query = { date: selectedDate, ...(selectedLocationId ? { locationId: selectedLocationId } : {}) };
    void Promise.all([api.getSalesReport(query), api.getMovementReport(query), api.getValuationReport(query), api.getProfitReport(query), api.getDiscrepancyReport(query), api.getLowStockReport(query)])
      .then(([sales, movements, valuation, profit, discrepancies, lowStock]) => {
        if (live) setData({ sales, movements, valuation, profit, discrepancies, lowStock });
      }).catch(() => { if (live) setError('Reports could not be loaded. Check the location and date, then try again.'); });
    return () => { live = false; };
  }, [api, selectedDate, selectedLocationId, locations.length, refreshKey]);
  const updateLocation = (nextLocationId: string) => filter ? onFilterChange?.({ locationId: nextLocationId, date: selectedDate }) : setLocationId(nextLocationId);
  const updateDate = (nextDate: string) => filter ? onFilterChange?.({ locationId: selectedLocationId, date: nextDate }) : setDate(nextDate);
  async function exportCsv() {
    setExportMessage(''); setExportError(false); setExportBusy(true);
    try {
      const saved = await api.exportReportCsv(reportKind, { date: selectedDate, ...(selectedLocationId ? { locationId: selectedLocationId } : {}) });
      if (saved) setExportMessage('CSV export saved.');
    } catch { setExportError(true); setExportMessage('The CSV export could not be saved. Try exporting again.'); }
    finally { setExportBusy(false); }
  }
  return <section className="catalog-page reports-page" aria-labelledby="page-title">
    <PageHeader eyebrow="Daily ledger extracts" title="Reports" titleId="page-title"
      description={`${reportLabels[reportKind]} · ${locations.find((location) => location.id === selectedLocationId)?.name ?? 'All locations'} · ${selectedDate}`}
      actions={<div className="filter-row report-filters">
        <label className="form-field compact-field">Report type<select aria-label="Report type" value={reportKind} onChange={(event) => { setReportKind(event.target.value as ReportKind); setExportMessage(''); }}>
          {(Object.entries(reportLabels) as Array<[ReportKind, string]>).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
        </select></label>
        <label className="form-field compact-field">Location<select aria-label="Report location" value={selectedLocationId} onChange={(event) => updateLocation(event.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label className="form-field compact-field">Report date<input aria-label="Report date" type="date" value={selectedDate} onChange={(event) => updateDate(event.target.value)} /></label>
        <Button variant="primary" icon="export" busy={exportBusy} onClick={() => void exportCsv()}>{exportBusy ? 'Exporting CSV…' : 'Export CSV'}</Button>
        <Button variant="secondary" icon="reports" onClick={() => window.print()}>Print report</Button>
      </div>} />
    {exportMessage && <InlineNotice tone={exportError ? 'danger' : 'success'} title={exportMessage} />}
    {error && <InlineNotice tone="danger" title="Reports unavailable" action={<Button variant="secondary" onClick={() => setRefreshKey((value) => value + 1)}>Try again</Button>}>{error}</InlineNotice>}
    {!data ? !error && <p role="status" className="loading-note">Loading reports…</p> : <FocusedReport kind={reportKind} data={data} />}
  </section>;
}
