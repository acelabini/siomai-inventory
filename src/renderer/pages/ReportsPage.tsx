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

export default function ReportsPage({ api = getInventoryApi() }: { api?: InventoryApi }) {
  const [locations, setLocations] = useState<CatalogLocation[]>([]);
  const [locationId, setLocationId] = useState('');
  const [date, setDate] = useState(manilaToday);
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [movements, setMovements] = useState<MovementReport | null>(null);
  const [valuation, setValuation] = useState<ValuationReport | null>(null);
  const [profit, setProfit] = useState<ProfitReport | null>(null);
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyReport | null>(null);
  const [lowStock, setLowStock] = useState<LowStockReport | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { let live = true; void api.listLocations().then((items) => { if (live) { setLocations(items); setLocationId((current) => current || items[0]?.id || ''); } }).catch(() => { if (live) setError('Locations could not be loaded.'); }); return () => { live = false; }; }, [api]);
  useEffect(() => {
    if (!date || !locations.length) return;
    let live = true; setError('');
    const filter = { date, ...(locationId ? { locationId } : {}) };
    void Promise.all([api.getSalesReport(filter), api.getMovementReport(filter), api.getValuationReport(filter), api.getProfitReport(filter), api.getDiscrepancyReport(filter), api.getLowStockReport(filter)])
      .then(([salesData, movementData, valuationData, profitData, discrepancyData, lowStockData]) => {
        if (!live) return; setSales(salesData); setMovements(movementData); setValuation(valuationData); setProfit(profitData); setDiscrepancies(discrepancyData); setLowStock(lowStockData);
      }).catch(() => { if (live) setError('Reports could not be loaded.'); });
    return () => { live = false; };
  }, [api, date, locationId, locations.length]);
  return <section className="catalog-page reports-page" aria-labelledby="page-title">
    <div className="page-heading"><div><p className="eyebrow">Daily ledger extracts</p><h1 id="page-title">Reports</h1></div><button type="button" className="primary-button" onClick={() => window.print()}>Print report</button></div>
    <div className="filter-row report-filters">
      <label className="form-field compact-field">Location<select aria-label="Location" value={locationId} onChange={(event) => setLocationId(event.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      <label className="form-field compact-field">Report date<input aria-label="Report date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
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
    </>}
  </section>;
}
