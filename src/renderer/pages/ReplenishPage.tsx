import { useEffect, useMemo, useState } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import type { CatalogLocation, CatalogProduct, InventoryBalance } from '../../shared/schemas';
import { toPieces } from '../../main/domain/quantities';
import { getInventoryApi } from '../api';
import { formatMoney, formatQuantity, LocationSelect, proratedCentavos } from './stock-shared';

type Line = { productId: string; quantity: string; unit: 'piece' | 'pack' };
const blankLine = (productId = ''): Line => ({ productId, quantity: '', unit: 'piece' });

function linePreview(line: Line, products: CatalogProduct[]) {
  const product = products.find((item) => item.id === line.productId);
  if (!product || !line.quantity || Number(line.quantity) <= 0) return { pieces: 0, cost: 0 as number | null, product };
  let pieces: number;
  try {
    pieces = toPieces(Number(line.quantity), line.unit, product.piecesPerPack);
  } catch { return { pieces: 0, cost: 0, product }; }
  let cost: number | null;
  try { cost = proratedCentavos(product.purchaseCostPerPackCentavos, pieces, product.piecesPerPack); }
  catch { cost = null; }
  return { pieces, cost, product };
}

export default function ReplenishPage({ api = getInventoryApi(), activeLocationId, onLocationChange }: { api?: InventoryApi; activeLocationId?: string; onLocationChange?: (locationId: string) => void }) {
  const [locations, setLocations] = useState<CatalogLocation[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [locationId, setLocationId] = useState('');
  const selectedLocationId = activeLocationId ?? locationId;
  const updateLocation = (value: string) => activeLocationId === undefined ? setLocationId(value) : onLocationChange?.(value);
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([api.listLocations(), api.listProducts()]).then(([nextLocations, nextProducts]) => {
      if (!active) return;
      setLocations(nextLocations); setProducts(nextProducts);
      if (activeLocationId === undefined) setLocationId(nextLocations[0]?.id ?? '');
      setLines([blankLine(nextProducts[0]?.id ?? '')]);
    }).catch(() => { if (active) setError('Products and locations could not be loaded.'); });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    if (!selectedLocationId) return;
    let active = true;
    void api.getBalances(selectedLocationId).then((value) => { if (active) setBalances(value); }).catch(() => { if (active) setError('Current availability could not be loaded.'); });
    return () => { active = false; };
  }, [api, selectedLocationId]);

  const previews = useMemo(() => lines.map((line) => linePreview(line, products)), [lines, products]);
  const totalCost = previews.reduce<number | null>((sum, preview) => sum === null || preview.cost === null ? null : sum + preview.cost, 0);
  const valid = lines.every((line, index) => line.productId && previews[index].pieces > 0) && new Set(lines.map((line) => line.productId)).size === lines.length;

  function updateLine(index: number, changes: Partial<Line>) {
    setLines((current) => current.map((line, itemIndex) => itemIndex === index ? { ...line, ...changes } : line));
  }

  async function submit() {
    setError(''); setSuccess('');
    if (!valid || !selectedLocationId) { setError('Enter a positive quantity for each product and use each product once.'); return; }
    try {
      await api.recordReplenishment({ locationId: selectedLocationId, note: note.trim() || undefined, lines: lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity), unit: line.unit })) });
      setLines([blankLine(products[0]?.id ?? '')]); setNote(''); setSuccess('Replenishment recorded.');
      setBalances(await api.getBalances(selectedLocationId));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Replenishment could not be recorded.'); }
  }

  const availability = new Map(balances.map((balance) => [balance.productId, balance.quantityPieces]));
  return <section className="catalog-page" aria-labelledby="replenish-title">
    <div className="page-heading"><div><p className="eyebrow">STOCK IN</p><h1 id="replenish-title">Replenish stock</h1></div></div>
    <div className="stock-workflow-layout">
      <form className="catalog-form stock-lines" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {locations.length > 0 && <LocationSelect locations={locations} value={selectedLocationId} onChange={updateLocation} />}
        {lines.map((line, index) => {
          const preview = previews[index];
          const current = availability.get(line.productId) ?? 0;
          return <fieldset className="stock-line" key={index}><legend>Product {index + 1}</legend>
            <label className="form-field">Product<select value={line.productId} onChange={(event) => updateLine(index, { productId: event.target.value })}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
            <div className="quantity-row"><label className="form-field">Quantity<input aria-label="Quantity" type="number" min="0.01" step="any" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></label>
              <label className="form-field">Unit<select aria-label="Unit" value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value as Line['unit'] })}><option value="piece">Piece</option><option value="pack">Pack</option></select></label></div>
            <p className="availability-note">Available: {formatQuantity(current, preview.product?.piecesPerPack ?? 1)}</p>
            <p className="conversion-preview">{preview.pieces > 0 ? `Converts to ${preview.pieces} pieces` : 'Enter a quantity to preview pieces'}</p>
            {lines.length > 1 && <button className="text-button destructive" type="button" onClick={() => setLines((currentLines) => currentLines.filter((_, itemIndex) => itemIndex !== index))}>Remove line</button>}
          </fieldset>;
        })}
        {products.length > lines.length && <button className="secondary-button" type="button" onClick={() => setLines((current) => [...current, blankLine(products.find((product) => !current.some((line) => line.productId === product.id))?.id ?? '')])}>Add another product</button>}
        <label className="form-field">Note<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
        {error && <p role="alert" className="field-error">{error}</p>}{success && <p role="status" className="success-note">{success}</p>}
        <button className="primary-button" type="submit" disabled={!valid || !selectedLocationId}>Record replenishment</button>
      </form>
      <aside className="workflow-summary" aria-label="Replenishment summary"><p className="empty-kicker">CONFIRMATION</p><h2>Stock received</h2><dl><div><dt>Products</dt><dd>{lines.filter((line, index) => previews[index].pieces > 0).length}</dd></div><div><dt>Total pieces</dt><dd>{previews.reduce((sum, preview) => sum + preview.pieces, 0)}</dd></div><div><dt>Total cost</dt><dd>{totalCost === null || !Number.isSafeInteger(totalCost) ? '—' : formatMoney(totalCost)}</dd></div></dl>
        <h3 className="summary-subheading">On hand after replenishment</h3>
        <ul className="balance-preview-list">{lines.map((line, index) => {
          const preview = previews[index];
          const current = availability.get(line.productId) ?? 0;
          return <li key={line.productId || index}><span>{preview.product?.name ?? 'Select a product'}</span><strong>{formatQuantity(current + preview.pieces, preview.product?.piecesPerPack ?? 1)}</strong></li>;
        })}</ul>
        <p>Each line keeps the current purchase cost as a ledger snapshot.</p></aside>
    </div>
  </section>;
}
