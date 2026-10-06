import { useEffect, useState } from 'react';
import type { DiscrepancyReport, InventoryApi, LowStockReport, MovementReport, ProfitReport, SalesReport, ValuationReport } from '../../shared/contracts';
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

export default function ReportsPage({ api = getInventoryApi(), filter, onFilterChange }: { api?: InventoryApi; filter?: SharedFilter; onFilterChange?: (filter: { locationId: string; date: string }) => void }) {
  const [localLocations, setLocalLocations] = useState<CatalogLocation[]>([]);
  const [locationId, setLocationId] = useState('');
  const [date, setDate] = useState(manilaToday);
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [movements, setMovements] = useState<MovementReport | null>(null);
  const [valuation, setValuation] = useState<ValuationReport | null>(null);
  const [profit, setProfit] = useState<ProfitReport | null>(null);
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyReport | null>(null);
  const [lowStock, setLowStock] = useState<LowStockReport | null>(null);
  const [error, setError] = useState('');
  const locations = filter?.locations ?? localLocations;
  const selectedLocationId = filter?.locationId ?? locationId;
  const selectedDate = filter?.date ?? date;
  useEffect(() => { if (filter) return; let live = true; void api.listLocations().then((items) => { if (live) { setLocalLocations(items); setLocationId((current) => current || items[0]?.id || ''); } }).catch(() => { if (live) setError('Locations could not be loaded.'); }); return () => { live = false; }; }, [api, filter]);
  useEffect(() => {
    if (!selectedDate || !locations.length) return;
    let live = true; setError('');
    const query = { date: selectedDate, ...(selectedLocationId ? { locationId: selectedLocationId } : {}) };
    void Promise.all([api.getSalesReport(query), api.getMovementReport(query), api.getValuationReport(query), api.getProfitReport(query), api.getDiscrepancyReport(query), api.getLowStockReport(query)])
      .then(([salesData, movementData, valuationData, profitData, discrepancyData, lowStockData]) => {
        if (!live) return; setSales(salesData); setMovements(movementData); setValuation(valuationData); setProfit(profitData); setDiscrepancies(discrepancyData); setLowStock(lowStockData);
      }).catch(() => { if (live) setError('Reports could not be loaded.'); });
    return () => { live = false; };
  }, [api, selectedDate, selectedLocationId, locations.length]);
  const updateLocation = (nextLocationId: string) => filter ? onFilterChange?.({ locationId: nextLocationId, date: selectedDate }) : setLocationId(nextLocationId);
  const updateDate = (nextDate: string) => filter ? onFilterChange?.({ locationId: selectedLocationId, date: nextDate }) : setDate(nextDate);
  return <section className="catalog-page reports-page" aria-labelledby="page-title">
    <div className="page-heading"><div><p className="eyebrow">Daily ledger extracts</p><h1 id="page-title">Reports</h1></div><button type="button" className="primary-button" onClick={() => window.print()}>Print report</button></div>
    <div className="filter-row report-filters">
      <label className="form-field compact-field">Location<select aria-label="Report location" value={selectedLocationId} onChange={(event) => updateLocation(event.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      <label className="form-field compact-field">Report date<input aria-label="Report date" type="date" value={selectedDate} onChange={(event) => updateDate(event.target.value)} /></label>
    </div>
    {error && <p role="alert" className="field-error">{error}</p>}
    {!profit || !valuation || !sales || !movements || !discrepancies || !lowStock ? <p role="status">Loading reports…</p> : <>
      <section className="metric-grid report-metrics" aria-label="Report summary">
        <MetricCard label="Revenue" value={peso(profit.revenueCentavos)} /><MetricCard label="Cost" value={peso(profit.costCentavos)} /><MetricCard label="Gross profit" value={peso(profit.grossProfitCentavos)} />
        <MetricCard label="Stock value" value={peso(valuation.totalValueCentavos)} /><MetricCard label="Discrepancies" value={String(discrepancies.count)} /><MetricCard label="Low stock" value={String(lowStock.count)} />
      </section>
      <h2 className="report-section-title">Sales</h2>
      <DataTable label="Sales report" rows={sales.sales} rowKey={(row) => row.id} columns={[
        { key: 'time', label: 'Recorded at', render: (row) => new Date(`${row.businessAt.replace(' ', 'T')}Z`).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) },
        { key: 'sale', label: 'Sale', render: (row) => row.id.slice(0, 8) }, { key: 'revenue', label: 'Revenue', numeric: true, render: (row) => peso(row.totalCentavos) },
        { key: 'cost', label: 'Cost', numeric: true, render: (row) => peso(row.costCentavos) }, { key: 'profit', label: 'Gross profit', numeric: true, render: (row) => peso(row.grossProfitCentavos) },
      ]} />
      <h2 className="report-section-title">Stock movements</h2>
      <DataTable label="Stock movement report" rows={movements.movements} rowKey={(row) => row.id} columns={[
        { key: 'time', label: 'Time', render: (row) => new Date(`${row.occurredAt.replace(' ', 'T')}Z`).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' }) },
        { key: 'product', label: 'Product', render: (row) => row.productName }, { key: 'type', label: 'Movement', render: (row) => row.movementType.replaceAll('_', ' ') },
        { key: 'quantity', label: 'Pieces', numeric: true, render: (row) => row.quantityPieces },
      ]} />
      <h2 className="report-section-title">Stock valuation</h2>
      <p className="report-note">Valuation uses the current product purchase cost for stock on the selected date; historical product costs are not stored.</p>
      <DataTable label="Stock valuation details" rows={valuation.items} rowKey={(row) => `${row.locationId}-${row.productId}`} columns={[
        { key: 'product', label: 'Product', render: (row) => row.productName }, { key: 'pieces', label: 'On hand', numeric: true, render: (row) => row.quantityPieces },
        { key: 'value', label: 'Stock value', numeric: true, render: (row) => peso(row.valueCentavos) },
      ]} />
      <h2 className="report-section-title">Stock count discrepancies</h2>
      <DataTable label="Stock count discrepancies" rows={discrepancies.items} rowKey={(row) => `${row.countedAt}-${row.locationId}-${row.productId}`} columns={[
        { key: 'time', label: 'Counted at', render: (row) => new Date(`${row.countedAt.replace(' ', 'T')}Z`).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) },
        { key: 'product', label: 'Product', render: (row) => row.productName }, { key: 'expected', label: 'Expected', numeric: true, render: (row) => row.expectedPieces },
        { key: 'counted', label: 'Counted', numeric: true, render: (row) => row.countedPieces }, { key: 'difference', label: 'Variance', numeric: true, render: (row) => row.differencePieces },
      ]} />
      <h2 className="report-section-title">Low stock</h2>
      <DataTable label="Low stock details" rows={lowStock.items} rowKey={(row) => `${row.locationId}-${row.productId}`} columns={[
        { key: 'product', label: 'Product', render: (row) => row.productName }, { key: 'quantity', label: 'On hand', numeric: true, render: (row) => row.quantityPieces },
        { key: 'threshold', label: 'Threshold', numeric: true, render: (row) => row.lowStockThresholdPieces },
      ]} />
    </>}
  </section>;
}
