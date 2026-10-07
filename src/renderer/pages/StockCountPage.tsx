import { useEffect, useState } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import type { CatalogLocation, CatalogProduct, InventoryBalance } from '../../shared/schemas';
import { toPieces } from '../../main/domain/quantities';
import { getInventoryApi } from '../api';
import { formatMoney, LocationSelect } from './stock-shared';

export default function StockCountPage({ api = getInventoryApi(), activeLocationId, onLocationChange }: { api?: InventoryApi; activeLocationId?: string; onLocationChange?: (locationId: string) => void }) {
  const [locations, setLocations] = useState<CatalogLocation[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [locationId, setLocationId] = useState('');
  const selectedLocationId = activeLocationId ?? locationId;
  const updateLocation = (value: string) => activeLocationId === undefined ? setLocationId(value) : onLocationChange?.(value);
  const [productId, setProductId] = useState('');
  const [countedQuantity, setCountedQuantity] = useState('');
  const [unit, setUnit] = useState<'piece' | 'pack'>('piece');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([api.listLocations(), api.listProducts()]).then(([nextLocations, nextProducts]) => {
      if (!active) return;
      setLocations(nextLocations); setProducts(nextProducts);
      if (activeLocationId === undefined) setLocationId(nextLocations[0]?.id ?? '');
      setProductId(nextProducts[0]?.id ?? '');
    }).catch(() => { if (active) setError('Products and locations could not be loaded.'); });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    if (!selectedLocationId) return;
    let active = true;
    void api.getBalances(selectedLocationId).then((value) => { if (active) setBalances(value); }).catch(() => { if (active) setError('Current stock could not be loaded.'); });
    return () => { active = false; };
  }, [api, selectedLocationId]);

  const product = products.find((item) => item.id === productId);
  const expectedPieces = balances.find((item) => item.productId === productId)?.quantityPieces ?? 0;
  let countedPieces: number | null = null;
  try { if (countedQuantity !== '' && product) countedPieces = Number(countedQuantity) === 0 ? 0 : toPieces(Number(countedQuantity), unit, product.piecesPerPack); } catch { /* show no difference for non-piece conversions */ }
  const difference = countedPieces === null ? null : countedPieces - expectedPieces;
  const valueImpact = difference === null || !product ? null : Math.round(product.purchaseCostPerPackCentavos * difference / product.piecesPerPack);
  const signedValueImpact = valueImpact === null ? '—' : `${valueImpact > 0 ? '+' : valueImpact < 0 ? '−' : ''}${formatMoney(Math.abs(valueImpact))}`;
  const requiresReason = difference !== null && difference !== 0;
  const valid = countedPieces !== null && (!requiresReason || reason.trim().length > 0);

  async function submit() {
    if (countedPieces === null || (requiresReason && !reason.trim())) { setError(requiresReason ? 'A reason is required for the stock-count difference.' : 'Enter a valid counted quantity.'); return; }
    setError(''); setSuccess('');
    try {
      await api.submitStockCount({ locationId: selectedLocationId, lines: [{ productId, countedQuantity: Number(countedQuantity), unit, ...(reason.trim() ? { reason: reason.trim() } : {}) }] });
      setCountedQuantity(''); setReason(''); setSuccess('Stock count recorded.'); setBalances(await api.getBalances(selectedLocationId));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Stock count could not be recorded.'); }
  }

  return <section className="catalog-page" aria-labelledby="stock-count-title"><div className="page-heading"><div><p className="eyebrow">PHYSICAL COUNT</p><h1 id="stock-count-title">Stock count</h1></div></div>
    <div className="stock-workflow-layout"><form className="catalog-form stock-lines" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {locations.length > 0 && <LocationSelect locations={locations} value={selectedLocationId} onChange={updateLocation} />}
      <label className="form-field">Product<select value={productId} onChange={(event) => setProductId(event.target.value)}>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <p className="availability-note">Expected on hand: {expectedPieces} pc</p>
      <div className="quantity-row"><label className="form-field">Counted quantity<input aria-label="Counted quantity" type="number" min="0" step="any" value={countedQuantity} onChange={(event) => setCountedQuantity(event.target.value)} /></label><label className="form-field">Unit<select aria-label="Unit" value={unit} onChange={(event) => setUnit(event.target.value as 'piece' | 'pack')}><option value="piece">Piece</option><option value="pack">Pack</option></select></label></div>
      {difference !== null && <p className={difference === 0 ? 'count-difference' : 'count-difference discrepancy'}>Difference: {difference > 0 ? '+' : ''}{difference} pc</p>}
      <label className="form-field">Reason{requiresReason && <span className="required-hint">Required</span>}<textarea aria-label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} /></label>
      {requiresReason && !reason.trim() && <p className="field-error">Reason is required for a discrepancy.</p>}
      {error && <p role="alert" className="field-error">{error}</p>}{success && <p role="status" className="success-note">{success}</p>}
      <button className="primary-button" type="submit" disabled={!valid}>Submit stock count</button>
    </form><aside className="workflow-summary" aria-label="Stock-count summary"><p className="empty-kicker">COUNT SUMMARY</p><h2>{product?.name ?? 'Select product'}</h2><dl><div><dt>Expected</dt><dd>{expectedPieces} pc</dd></div><div><dt>Counted</dt><dd>{countedPieces ?? '—'} pc</dd></div><div><dt>Difference</dt><dd className={difference ? 'discrepancy-text' : ''}>{difference === null ? '—' : `${difference > 0 ? '+' : ''}${difference} pc`}</dd></div><div><dt>Value impact</dt><dd className={valueImpact ? 'discrepancy-text' : ''}>{signedValueImpact}</dd></div></dl><p>Any adjustment is recorded with its reason in the movement history.</p></aside></div>
  </section>;
}
