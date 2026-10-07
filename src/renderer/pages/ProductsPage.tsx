import { useEffect, useState, type FormEvent } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import type { CatalogProduct } from '../../shared/schemas';
import { getInventoryApi } from '../api';

type Props = { api?: InventoryApi };

export default function ProductsPage({ api = getInventoryApi() }: Props) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [piecesPerPack, setPiecesPerPack] = useState('1');
  const [purchaseCost, setPurchaseCost] = useState('0');
  const [piecePrice, setPiecePrice] = useState('0');
  const [packPrice, setPackPrice] = useState('0');
  const [lowStockThresholdPieces, setLowStockThresholdPieces] = useState('0');

  async function refresh() { setProducts(await api.listProducts()); }
  useEffect(() => { void refresh(); }, [api]);

  function resetForm() {
    setEditingId(undefined); setName(''); setSku(''); setPiecesPerPack('1');
    setPurchaseCost('0'); setPiecePrice('0'); setPackPrice('0');
    setLowStockThresholdPieces('0');
  }

  function edit(product: CatalogProduct) {
    setEditingId(product.id); setName(product.name); setSku(product.sku);
    setPiecesPerPack(String(product.piecesPerPack));
    setPurchaseCost(String(product.purchaseCostPerPackCentavos));
    setPiecePrice(String(product.sellingPricePerPieceCentavos));
    setPackPrice(String(product.sellingPricePerPackCentavos));
    setLowStockThresholdPieces(String(product.lowStockThresholdPieces));
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setError('');
    const threshold = Number(lowStockThresholdPieces);
    if (!Number.isSafeInteger(threshold) || threshold < 0) {
      setError('Low-stock threshold must be a nonnegative whole number of pieces.');
      return;
    }
    try {
      await api.saveProduct({
        ...(editingId ? { id: editingId } : {}),
        name, sku, piecesPerPack: Number(piecesPerPack),
        purchaseCostPerPackCentavos: Number(purchaseCost),
        sellingPricePerPieceCentavos: Number(piecePrice),
        sellingPricePerPackCentavos: Number(packPrice), lowStockThresholdPieces: threshold,
      });
      resetForm(); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Product could not be saved.'); }
  }

  async function archive(product: CatalogProduct) {
    if (!window.confirm(`Archive ${product.name}? Existing stock history will be kept.`)) return;
    try { await api.archiveProduct(product.id); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Product could not be archived.'); }
  }

  return <section className="catalog-page" aria-labelledby="products-title">
    <div className="page-heading"><div><p className="eyebrow">CATALOG</p><h1 id="products-title">Products</h1></div></div>
    <div className="catalog-layout">
      <form className="catalog-form" onSubmit={(event) => void save(event)}>
        <h2>{editingId ? 'Edit product' : 'Add a product'}</h2>
        <label className="form-field">Product name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label className="form-field">SKU<input value={sku} onChange={(event) => setSku(event.target.value)} required /></label>
        <label className="form-field">Pieces per pack<input type="number" min="1" step="1" value={piecesPerPack} onChange={(event) => setPiecesPerPack(event.target.value)} required /></label>
        <label className="form-field">Purchase cost per pack (centavos)<input type="number" min="0" step="1" value={purchaseCost} onChange={(event) => setPurchaseCost(event.target.value)} required /></label>
        <label className="form-field">Selling price per piece (centavos)<input type="number" min="0" step="1" value={piecePrice} onChange={(event) => setPiecePrice(event.target.value)} required /></label>
        <label className="form-field">Selling price per pack (centavos)<input type="number" min="0" step="1" value={packPrice} onChange={(event) => setPackPrice(event.target.value)} required /></label>
        <label className="form-field">Low-stock threshold (pieces)<input aria-label="Low-stock threshold (pieces)" type="number" min="0" step="1" value={lowStockThresholdPieces} onChange={(event) => setLowStockThresholdPieces(event.target.value)} required /></label>
        {error && <p role="alert" className="field-error">{error}</p>}
        <div className="form-actions"><button className="primary-button" type="submit">Save product</button>{editingId && <button className="secondary-button" type="button" onClick={resetForm}>Cancel</button>}</div>
      </form>
      <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Product</th><th>SKU</th><th>Pack</th><th>Purchase cost</th><th>Selling price</th><th>Actions</th></tr></thead>
        <tbody>{products.map((product) => <tr key={product.id}><td>{product.name}</td><td className="mono">{product.sku}</td><td>{product.piecesPerPack} pc</td><td>₱{(product.purchaseCostPerPackCentavos / 100).toFixed(2)}</td><td>{product.sellingPricePerPieceCentavos === 0 && product.sellingPricePerPackCentavos === 0 ? <span className="price-warning">Set price before sale</span> : `₱${(product.sellingPricePerPieceCentavos / 100).toFixed(2)} / pc`}</td><td><button className="text-button" type="button" onClick={() => edit(product)}>Edit</button><button className="text-button destructive" type="button" onClick={() => void archive(product)}>Archive</button></td></tr>)}</tbody>
      </table>{products.length === 0 && <p className="empty-note">No active products yet.</p>}</div>
    </div>
  </section>;
}
