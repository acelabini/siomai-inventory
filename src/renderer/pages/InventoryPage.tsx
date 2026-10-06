import { useEffect, useState } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import type { CatalogLocation, CatalogProduct, InventoryBalance, StockMovement } from '../../shared/schemas';
import { getInventoryApi } from '../api';
import { formatMoney, formatQuantity, LocationSelect } from './stock-shared';

export default function InventoryPage({ api = getInventoryApi() }: { api?: InventoryApi }) {
  const [locations, setLocations] = useState<CatalogLocation[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [locationId, setLocationId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([api.listLocations(), api.listProducts()]).then(([nextLocations, nextProducts]) => {
      if (!active) return;
      setLocations(nextLocations); setProducts(nextProducts); setLocationId(nextLocations[0]?.id ?? '');
    }).catch(() => { if (active) setError('Inventory could not be loaded.'); });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    if (!locationId) return;
    let active = true;
    void Promise.all([api.getBalances(locationId), api.getMovementHistory({ locationId, limit: 40 })]).then(([nextBalances, nextMovements]) => {
      if (active) { setBalances(nextBalances); setMovements(nextMovements); }
    }).catch(() => { if (active) setError('Inventory could not be loaded.'); });
    return () => { active = false; };
  }, [api, locationId]);

  const quantityByProduct = new Map(balances.map((balance) => [balance.productId, balance.quantityPieces]));
  const productById = new Map(products.map((product) => [product.id, product]));
  return <section className="ledger-page" aria-labelledby="inventory-title">
    <div className="page-heading"><div><p className="eyebrow">STOCK LEDGER</p><h1 id="inventory-title">Inventory</h1></div>
      {locations.length > 0 && <LocationSelect locations={locations} value={locationId} onChange={setLocationId} />}</div>
    <div className="ledger-ribbon" aria-label="Stock movement sequence"><span>Opening</span><span aria-hidden="true">→</span><span>Replenished</span><span aria-hidden="true">→</span><span>Sold</span><span aria-hidden="true">→</span><strong>On hand</strong></div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="catalog-table-wrap inventory-table-wrap"><table className="catalog-table"><thead><tr><th>Product</th><th>SKU</th><th>On hand</th><th>Low stock at</th><th>Stock value</th></tr></thead><tbody>
      {products.map((product) => {
        const quantity = quantityByProduct.get(product.id) ?? 0;
        const value = Math.round(product.purchaseCostPerPackCentavos * quantity / product.piecesPerPack);
        return <tr key={product.id}><td>{product.name}</td><td className="mono">{product.sku}</td><td>{formatQuantity(quantity, product.piecesPerPack)}</td><td>{product.lowStockThresholdPieces ? `${product.lowStockThresholdPieces} pc` : '—'}</td><td>{formatMoney(value)}</td></tr>;
      })}
    </tbody></table>{products.length === 0 && <p className="empty-note">No active products yet.</p>}</div>
    <section className="movement-panel" aria-labelledby="movement-title"><h2 id="movement-title">Recent stock movements</h2>
      {movements.length === 0 ? <p className="empty-note">No stock movements at this location.</p> : <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>When</th><th>Product</th><th>Movement</th><th>Quantity</th><th>Note</th></tr></thead><tbody>
        {movements.map((movement) => <tr key={movement.id}><td>{movement.occurredAt}</td><td>{productById.get(movement.productId)?.name ?? movement.productName}</td><td>{movement.movementType.replaceAll('_', ' ')}</td><td className="mono">{movement.quantityPieces > 0 ? '+' : ''}{movement.quantityPieces} pc</td><td>{movement.note ?? '—'}</td></tr>)}
      </tbody></table></div>}
    </section>
  </section>;
}
