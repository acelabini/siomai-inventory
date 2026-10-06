import { useEffect, useMemo, useState } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import type { CatalogLocation, CatalogProduct, InventoryBalance, SaleReceipt as SaleReceiptData } from '../../shared/schemas';
import { pesosToCentavos } from '../../main/domain/money';
import { toPieces } from '../../main/domain/quantities';
import { getInventoryApi } from '../api';
import { formatMoney, formatQuantity, LocationSelect } from '../pages/stock-shared';
import SaleReceipt from './SaleReceipt';

type Line = { productId: string; quantity: string; unit: 'piece' | 'pack' };
type Preview = { pieces: number; revenue: number; product?: CatalogProduct; error?: string };

function previewLine(line: Line, products: CatalogProduct[]): Preview {
  const product = products.find((item) => item.id === line.productId);
  if (!product || !line.quantity) return { pieces: 0, revenue: 0, product };
  const quantity = Number(line.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return { pieces: 0, revenue: 0, product };
  try {
    const pieces = toPieces(quantity, line.unit, product.piecesPerPack);
    const unitPrice = line.unit === 'pack' ? product.sellingPricePerPackCentavos : product.sellingPricePerPieceCentavos;
    return { pieces, revenue: Math.round(quantity * unitPrice), product };
  } catch (error) { return { pieces: 0, revenue: 0, product, error: error instanceof Error ? error.message : 'Enter a valid quantity.' }; }
}

export default function SaleComposer({ api = getInventoryApi(), onCompleted, onVoid, renderReceipt = true }: { api?: InventoryApi; onCompleted?: (receipt: SaleReceiptData) => void; onVoid?: (receipt: SaleReceiptData, reason: string) => void | Promise<void>; renderReceipt?: boolean }) {
  const [locations, setLocations] = useState<CatalogLocation[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [locationId, setLocationId] = useState('');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [tendered, setTendered] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [receipt, setReceipt] = useState<SaleReceiptData | null>(null);
  const [saving, setSaving] = useState(false);
  const [voiding, setVoiding] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([api.listLocations(), api.listProducts()]).then(([nextLocations, nextProducts]) => {
      if (!active) return;
      setLocations(nextLocations); setProducts(nextProducts); setLocationId(nextLocations[0]?.id ?? '');
    }).catch(() => { if (active) setError('Products and locations could not be loaded.'); });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    if (!locationId) return;
    let active = true;
    void api.getBalances(locationId).then((value) => { if (active) setBalances(value); }).catch(() => { if (active) setError('Current availability could not be loaded.'); });
    return () => { active = false; };
  }, [api, locationId]);

  const matches = useMemo(() => products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(search.trim().toLowerCase()) && !lines.some((line) => line.productId === product.id)), [lines, products, search]);
  const previews = useMemo(() => lines.map((line) => previewLine(line, products)), [lines, products]);
  const total = previews.reduce((sum, line) => sum + line.revenue, 0);
  let paid = -1;
  try { if (tendered.trim()) paid = pesosToCentavos(tendered); } catch { paid = -1; }
  const availability = new Map(balances.map((item) => [item.productId, item.quantityPieces]));
  const valid = lines.length > 0 && previews.every((item, index) => item.product && item.pieces > 0 && item.error === undefined && (lines[index].unit === 'pack' ? item.product.sellingPricePerPackCentavos : item.product.sellingPricePerPieceCentavos) > 0 && item.pieces <= (availability.get(item.product.id) ?? 0)) && Number.isSafeInteger(total) && paid >= total;

  function updateLine(index: number, changes: Partial<Line>) {
    setLines((current) => current.map((line, itemIndex) => itemIndex === index ? { ...line, ...changes } : line));
  }

  async function complete() {
    if (!valid || !locationId || paid < 0) return;
    setError(''); setSuccess(''); setSaving(true);
    try {
      const result = await api.completeSale({ locationId, paymentCentavos: paid, note: note.trim() || undefined, lines: lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity), unit: line.unit })) });
      setReceipt(result); setLines([]); setSearch(''); setTendered(''); setNote(''); setSuccess('Sale completed.');
      onCompleted?.(result);
      try { setBalances(await api.getBalances(locationId)); }
      catch { setError('Sale completed, but current availability could not be refreshed.'); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The sale could not be completed.'); }
    finally { setSaving(false); }
  }

  async function voidReceipt(reason: string) {
    if (!receipt) return;
    setError(''); setVoiding(true);
    try {
      if (onVoid) await onVoid(receipt, reason);
      else setReceipt(await api.voidSale(receipt.id, reason));
      setBalances(await api.getBalances(locationId));
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The sale could not be voided.'); }
    finally { setVoiding(false); }
  }

  return <section className="catalog-page" aria-labelledby="sales-title">
    <div className="page-heading"><div><p className="eyebrow">DAILY LEDGER · STOCK OUT</p><h1 id="sales-title">New sale</h1></div>{locations.length > 0 && <LocationSelect locations={locations} value={locationId} onChange={setLocationId} />}</div>
    <div className="stock-workflow-layout sale-layout">
      <form className="catalog-form stock-lines" onSubmit={(event) => { event.preventDefault(); void complete(); }}>
        <label className="form-field">Find a product<input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or SKU" /></label>
        {search.trim() && <div className="sale-search-results" aria-label="Product search results">{matches.length ? matches.slice(0, 8).map((product) => <button className="secondary-button" type="button" key={product.id} onClick={() => { setLines((current) => [...current, { productId: product.id, quantity: '', unit: 'piece' }]); setSearch(''); }}>{product.name} <span className="mono">{product.sku}</span></button>) : <p className="empty-note">No matching products available to add.</p>}</div>}
        {lines.map((line, index) => {
          const preview = previews[index]; const product = preview.product; const available = product ? availability.get(product.id) ?? 0 : 0;
          return <fieldset className="stock-line sale-line" key={line.productId}><legend>{product?.name ?? 'Product'}</legend>
            <div className="quantity-row"><label className="form-field">Quantity for {product?.name}<input aria-label={`Quantity for ${product?.name}`} type="number" min="0.01" step="any" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></label>
              <label className="form-field">Unit<select aria-label={`Unit for ${product?.name}`} value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value as Line['unit'] })}><option value="piece">Piece</option><option value="pack">Pack</option></select></label></div>
            <p className="availability-note">Available: {formatQuantity(available, product?.piecesPerPack ?? 1)}</p>
            {preview.error && <p className="field-error">{preview.error}</p>}
            {product && ((line.unit === 'piece' ? product.sellingPricePerPieceCentavos : product.sellingPricePerPackCentavos) === 0) && <p className="price-warning">Set a selling price before this product can be sold.</p>}
            <div className="sale-line-footer"><span>{preview.pieces ? `${preview.pieces} pc` : '—'}</span><strong>{formatMoney(preview.revenue)}</strong><button className="text-button destructive" type="button" aria-label={`Remove ${product?.name}`} onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>
          </fieldset>;
        })}
        <label className="form-field">Amount tendered (₱)<input aria-label="Amount tendered" inputMode="decimal" value={tendered} onChange={(event) => setTendered(event.target.value)} /></label>
        <label className="form-field">Note<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} /></label>
        {error && <p role="alert" className="field-error">{error}</p>}{success && <p role="status" className="success-note">{success}</p>}
        <button className="primary-button" type="submit" disabled={!valid || saving}>{saving ? 'Completing…' : 'Complete sale'}</button>
      </form>
      <aside className="workflow-summary" aria-label="Sale summary"><p className="empty-kicker">CHECKOUT</p><h2>Transaction total</h2><dl><div><dt>Items</dt><dd>{previews.reduce((sum, item) => sum + item.pieces, 0)} pc</dd></div><div><dt>Total</dt><dd>{formatMoney(total)}</dd></div><div><dt>Tendered</dt><dd>{paid >= 0 ? formatMoney(paid) : '—'}</dd></div><div><dt>Change</dt><dd>{paid >= total && total > 0 ? formatMoney(paid - total) : '—'}</dd></div></dl><p>Pack and piece prices are saved with this sale as a permanent snapshot.</p></aside>
    </div>
    {renderReceipt && receipt && <SaleReceipt receipt={receipt} onVoid={voidReceipt} voiding={voiding} />}
  </section>;
}
