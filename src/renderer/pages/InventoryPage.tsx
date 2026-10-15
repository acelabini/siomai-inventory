import { useEffect, useState } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import type { CatalogLocation, CatalogProduct, InventoryBalance, StockMovement } from '../../shared/schemas';
import Button from '../components/ui/Button';
import DataTable from '../components/DataTable';
import InlineNotice from '../components/ui/InlineNotice';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import { getInventoryApi } from '../api';
import { formatMoney, formatMovementTimestamp, formatQuantity, LocationSelect, proratedCentavos } from './stock-shared';

export default function InventoryPage({ api = getInventoryApi(), activeLocationId, onLocationChange, onNavigate }: { api?: InventoryApi; activeLocationId?: string; onLocationChange?: (locationId: string) => void; onNavigate?: (page: string) => void }) {
  const [locations, setLocations] = useState<CatalogLocation[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [locationId, setLocationId] = useState('');
  const selectedLocationId = activeLocationId ?? locationId;
  const updateLocation = (value: string) => activeLocationId === undefined ? setLocationId(value) : onLocationChange?.(value);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low'>('all');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([api.listLocations(), api.listProducts()]).then(([nextLocations, nextProducts]) => {
      if (!active) return;
      setLocations(nextLocations); setProducts(nextProducts);
      if (activeLocationId === undefined) setLocationId(nextLocations[0]?.id ?? '');
    }).catch(() => { if (active) setError('Inventory could not be loaded.'); });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    if (!selectedLocationId) return;
    let active = true;
    void Promise.all([api.getBalances(selectedLocationId), api.getMovementHistory({ locationId: selectedLocationId, limit: 40 })]).then(([nextBalances, nextMovements]) => {
      if (active) { setBalances(nextBalances); setMovements(nextMovements); }
    }).catch(() => { if (active) setError('Inventory could not be loaded.'); });
    return () => { active = false; };
  }, [api, selectedLocationId]);

  const productById = new Map(products.map((product) => [product.id, product]));
  const quantityByProduct = new Map(balances.map((balance) => [balance.productId, balance.quantityPieces]));
  const rows = products.map((product) => {
    const quantity = quantityByProduct.get(product.id) ?? 0;
    let value: number | null;
    try { value = proratedCentavos(product.purchaseCostPerPackCentavos, quantity, product.piecesPerPack); }
    catch { value = null; }
    return { product, quantity, value };
  }).filter(({ product, quantity }) => {
    const matchesSearch = `${product.name} ${product.sku}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    const isLow = product.lowStockThresholdPieces > 0 && quantity <= product.lowStockThresholdPieces;
    return matchesSearch && (statusFilter === 'all' || isLow);
  });

  return <section className="ledger-page" aria-labelledby="inventory-title">
    <PageHeader eyebrow="Stock ledger" title="Inventory" titleId="inventory-title" actions={<>
      <Button variant="secondary" icon="replenish" onClick={() => onNavigate?.('Replenish')}>Replenish</Button>
      <Button variant="primary" icon="count" onClick={() => onNavigate?.('Stock count')}>Stock count</Button>
    </>} />
    <div className="inventory-context-row">
      {locations.length > 0 && <LocationSelect locations={locations} value={selectedLocationId} onChange={updateLocation} />}
      <label className="form-field inventory-search">Search inventory<input type="search" aria-label="Search inventory" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Product or SKU" /></label>
      <label className="form-field inventory-status-filter">Stock status<select aria-label="Stock status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | 'low')}><option value="all">All stock</option><option value="low">Low stock</option></select></label>
    </div>
    <div className="ledger-ribbon" aria-label="Stock movement sequence"><span>Opening</span><span aria-hidden="true">→</span><span>Replenished</span><span aria-hidden="true">→</span><span>Sold</span><span aria-hidden="true">→</span><strong>On hand</strong></div>
    {error && <InlineNotice tone="danger" title="Inventory could not be loaded" role="alert">Check the selected location and try again.</InlineNotice>}
    <DataTable label="Inventory" className="inventory-table-wrap" rows={rows} rowKey={(row) => row.product.id} empty={search || statusFilter === 'low' ? 'No products match these filters.' : 'No active products yet.'} columns={[
      { key: 'product', label: 'Product', render: (row) => <div className="inventory-product"><strong>{row.product.name}</strong><small>{row.product.sku}</small></div> },
      { key: 'on-hand', label: 'On hand', numeric: true, render: (row) => formatQuantity(row.quantity, row.product.piecesPerPack) },
      { key: 'status', label: 'Status', render: (row) => row.product.lowStockThresholdPieces > 0 && row.quantity <= row.product.lowStockThresholdPieces
        ? <StatusBadge tone="warning">Low stock</StatusBadge>
        : <StatusBadge tone="success">Healthy</StatusBadge> },
      { key: 'threshold', label: 'Low stock at', numeric: true, render: (row) => row.product.lowStockThresholdPieces ? `${row.product.lowStockThresholdPieces} pc` : '—' },
      { key: 'value', label: 'Stock value', numeric: true, render: (row) => row.value === null ? '—' : formatMoney(row.value) },
    ]} />
    <section className="movement-panel" aria-labelledby="movement-title"><h2 id="movement-title">Recent stock movements</h2>
      {movements.length === 0 ? <p className="empty-note">No stock movements at this location.</p> : <DataTable label="Recent stock movements" rows={movements} rowKey={(movement) => movement.id} columns={[
        { key: 'when', label: 'When', render: (movement) => formatMovementTimestamp(movement.occurredAt) },
        { key: 'product', label: 'Product', render: (movement) => productById.get(movement.productId)?.name ?? movement.productName },
        { key: 'movement', label: 'Movement', render: (movement) => movement.movementType.replaceAll('_', ' ') },
        { key: 'quantity', label: 'Quantity', numeric: true, render: (movement) => `${movement.quantityPieces > 0 ? '+' : ''}${movement.quantityPieces} pc` },
        { key: 'note', label: 'Note', render: (movement) => movement.note ?? '—' },
      ]} />}
    </section>
  </section>;
}
