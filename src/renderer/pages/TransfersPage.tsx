import { useEffect, useRef, useState } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import type { CatalogLocation, CatalogProduct, InventoryBalance } from '../../shared/schemas';
import { toPieces } from '../../main/domain/quantities';
import { getInventoryApi } from '../api';
import { formatQuantity, LocationSelect } from './stock-shared';

export default function TransfersPage({ api = getInventoryApi(), activeLocationId, onLocationChange }: { api?: InventoryApi; activeLocationId?: string; onLocationChange?: (locationId: string) => void }) {
  const [locations, setLocations] = useState<CatalogLocation[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [sourceId, setSourceId] = useState('');
  const selectedSourceId = activeLocationId ?? sourceId;
  const [destinationId, setDestinationId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<'piece' | 'pack'>('piece');
  const [note, setNote] = useState('');
  const [sourceBalances, setSourceBalances] = useState<InventoryBalance[]>([]);
  const [destinationBalances, setDestinationBalances] = useState<InventoryBalance[]>([]);
  const [balanceRevision, setBalanceRevision] = useState(0);
  const [loadedBalanceKey, setLoadedBalanceKey] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const previousSourceId = useRef(selectedSourceId);
  const balanceSelectionKey = `${selectedSourceId}\u0000${destinationId}`;
  const balanceRequestKey = `${balanceSelectionKey}\u0000${balanceRevision}`;
  const balancesReady = loadedBalanceKey === balanceRequestKey;
  const updateDestination = (value: string) => {
    setDestinationId(value);
    setBalanceRevision((revision) => revision + 1);
  };

  useEffect(() => {
    let active = true;
    void Promise.all([api.listLocations(), api.listProducts()]).then(([nextLocations, nextProducts]) => {
      if (!active) return;
      setLocations(nextLocations); setProducts(nextProducts);
      if (activeLocationId === undefined) setSourceId(nextLocations[0]?.id ?? '');
      setDestinationId(nextLocations.find((location) => location.id !== (activeLocationId ?? nextLocations[0]?.id))?.id ?? ''); setProductId(nextProducts[0]?.id ?? '');
    }).catch(() => { if (active) setError('Products and locations could not be loaded.'); });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    setSourceBalances([]);
    setDestinationBalances([]);
    setLoadedBalanceKey('');
    if (!selectedSourceId || !destinationId || selectedSourceId === destinationId) return;
    let active = true;
    void Promise.all([api.getBalances(selectedSourceId), api.getBalances(destinationId)]).then(([source, destination]) => {
      if (active) { setSourceBalances(source); setDestinationBalances(destination); setLoadedBalanceKey(balanceRequestKey); }
    }).catch(() => { if (active) setError('Location stock could not be loaded.'); });
    return () => { active = false; };
  }, [api, selectedSourceId, destinationId, balanceRequestKey]);

  useEffect(() => {
    if (previousSourceId.current === selectedSourceId) return;
    previousSourceId.current = selectedSourceId;
    if (selectedSourceId && selectedSourceId === destinationId) setDestinationId(locations.find((location) => location.id !== selectedSourceId)?.id ?? '');
  }, [destinationId, locations, selectedSourceId]);

  const product = products.find((item) => item.id === productId);
  const available = balancesReady ? sourceBalances.find((balance) => balance.productId === productId)?.quantityPieces ?? 0 : 0;
  const destinationAvailable = balancesReady ? destinationBalances.find((balance) => balance.productId === productId)?.quantityPieces ?? 0 : 0;
  let pieces = 0;
  try { if (quantity && product) pieces = toPieces(Number(quantity), unit, product.piecesPerPack); } catch { /* invalid conversions remain unsubmitable */ }
  const distinctLocations = selectedSourceId !== '' && destinationId !== '' && selectedSourceId !== destinationId;
  const enoughStock = balancesReady && pieces > 0 && pieces <= available;
  const disabled = !balancesReady || !distinctLocations || !productId || !enoughStock;

  function updateSource(value: string) {
    if (activeLocationId === undefined) setSourceId(value);
    else onLocationChange?.(value);
    setBalanceRevision((revision) => revision + 1);
  }

  async function submit() {
    if (!distinctLocations) { setError('Choose a different destination from the source.'); return; }
    if (!enoughStock) { setError('Enter a quantity available at the source location.'); return; }
    setError(''); setSuccess('');
    try {
      await api.transferStock({ fromLocationId: selectedSourceId, toLocationId: destinationId, note: note.trim() || undefined, lines: [{ productId, quantity: Number(quantity), unit }] });
      setQuantity(''); setNote(''); setSuccess('Stock transfer recorded.');
      setBalanceRevision((revision) => revision + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Transfer could not be recorded.'); }
  }

  return <section className="catalog-page" aria-labelledby="transfers-title"><div className="page-heading"><div><p className="eyebrow">BETWEEN LOCATIONS</p><h1 id="transfers-title">Transfers</h1></div></div>
    <div className="stock-workflow-layout"><form className="catalog-form stock-lines" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {locations.length > 0 && <><LocationSelect label="Source location" locations={locations} value={selectedSourceId} onChange={updateSource} /><LocationSelect label="Destination location" locations={locations} value={destinationId} onChange={updateDestination} /></>}
      {!distinctLocations && locations.length > 1 && <p className="field-error">Choose a different destination from the source.</p>}
      <label className="form-field">Product<select value={productId} onChange={(event) => setProductId(event.target.value)}>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="quantity-row"><label className="form-field">Quantity<input aria-label="Quantity" type="number" min="0.01" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label className="form-field">Unit<select aria-label="Unit" value={unit} onChange={(event) => setUnit(event.target.value as 'piece' | 'pack')}><option value="piece">Piece</option><option value="pack">Pack</option></select></label></div>
      <p className="availability-note">{balancesReady ? `Available at source: ${formatQuantity(available, product?.piecesPerPack ?? 1)}` : 'Loading location balances…'}</p>
      <label className="form-field">Note<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
      {error && <p role="alert" className="field-error">{error}</p>}{success && <p role="status" className="success-note">{success}</p>}
      <button className="primary-button" type="submit" disabled={disabled}>Transfer stock</button>
    </form><aside className="workflow-summary" aria-label="Transfer summary"><p className="empty-kicker">CONFIRMATION</p><h2>{locations.find((item) => item.id === selectedSourceId)?.name ?? 'Source'} → {locations.find((item) => item.id === destinationId)?.name ?? 'Destination'}</h2><dl><div><dt>Product</dt><dd>{product?.name ?? '—'}</dd></div><div><dt>Transfer quantity</dt><dd>{pieces ? formatQuantity(pieces, product?.piecesPerPack ?? 1) : '—'}</dd></div><div><dt>Source after transfer</dt><dd>{enoughStock ? formatQuantity(available - pieces, product?.piecesPerPack ?? 1) : '—'}</dd></div><div><dt>Destination after transfer</dt><dd>{enoughStock ? formatQuantity(destinationAvailable + pieces, product?.piecesPerPack ?? 1) : '—'}</dd></div></dl><p>Both location balances update together in the stock ledger.</p></aside></div>
  </section>;
}
