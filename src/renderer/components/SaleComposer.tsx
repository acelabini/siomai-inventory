import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import type { CatalogLocation, CatalogProduct, InventoryBalance, SaleReceipt as SaleReceiptData } from '../../shared/schemas';
import { pesosToCentavos } from '../../main/domain/money';
import { decimalQuantityPriceCentavos } from '../../shared/money';
import { toPieces } from '../../main/domain/quantities';
import { getInventoryApi } from '../api';
import { formatMoney, formatQuantity, LocationSelect } from '../pages/stock-shared';
import SaleReceipt from './SaleReceipt';
import Button from './ui/Button';
import EmptyState from './ui/EmptyState';
import Field from './ui/Field';
import InlineNotice from './ui/InlineNotice';
import PageHeader from './ui/PageHeader';
import Panel from './ui/Panel';

type Line = { id: number; productId: string; quantity: string; unit: 'piece' | 'pack' };
type Preview = { pieces: number; revenue: number; product?: CatalogProduct; error?: string };

function previewLine(line: Line, products: CatalogProduct[]): Preview {
  const product = products.find((item) => item.id === line.productId);
  if (!product || !line.quantity) return { pieces: 0, revenue: 0, product };
  const quantity = Number(line.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return { pieces: 0, revenue: 0, product };
  try {
    const pieces = toPieces(quantity, line.unit, product.piecesPerPack);
    const unitPrice = line.unit === 'pack' ? product.sellingPricePerPackCentavos : product.sellingPricePerPieceCentavos;
    return { pieces, revenue: decimalQuantityPriceCentavos(quantity, unitPrice), product };
  } catch (error) { return { pieces: 0, revenue: 0, product, error: error instanceof Error ? error.message : 'Enter a valid quantity.' }; }
}

export default function SaleComposer({ api = getInventoryApi(), onCompleted, onVoid, renderReceipt = true, activeLocationId, onLocationChange, availabilityRevision = 0 }: { api?: InventoryApi; onCompleted?: (receipt: SaleReceiptData) => void; onVoid?: (receipt: SaleReceiptData, reason: string) => void | Promise<void>; renderReceipt?: boolean; activeLocationId?: string; onLocationChange?: (locationId: string) => void; availabilityRevision?: number }) {
  const [locations, setLocations] = useState<CatalogLocation[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [balanceSnapshot, setBalanceSnapshot] = useState<{ context: string; balances: InventoryBalance[]; failed?: boolean } | null>(null);
  const [locationId, setLocationId] = useState('');
  const selectedLocationId = activeLocationId ?? locationId;
  const balanceContext = `${selectedLocationId}:${availabilityRevision}`;
  const updateLocation = (value: string) => activeLocationId === undefined ? setLocationId(value) : onLocationChange?.(value);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [tendered, setTendered] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [receipt, setReceipt] = useState<SaleReceiptData | null>(null);
  const [saving, setSaving] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const nextLineId = useRef(0);
  const focusLineId = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const formId = useId();

  useEffect(() => {
    let active = true;
    void Promise.all([api.listLocations(), api.listProducts()]).then(([nextLocations, nextProducts]) => {
      if (!active) return;
      setLocations(nextLocations); setProducts(nextProducts);
      if (activeLocationId === undefined) setLocationId(nextLocations[0]?.id ?? '');
    }).catch(() => { if (active) setError('Products and locations could not be loaded.'); });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    if (!selectedLocationId) return;
    let active = true;
    void api.getBalances(selectedLocationId).then((value) => { if (active) setBalanceSnapshot({ context: balanceContext, balances: value }); }).catch(() => { if (active) { setBalanceSnapshot({ context: balanceContext, balances: [], failed: true }); setError('Current availability could not be loaded.'); } });
    return () => { active = false; };
  }, [api, selectedLocationId, balanceContext]);

  const matches = useMemo(() => products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(search.trim().toLowerCase())), [products, search]);
  const previews = useMemo(() => lines.map((line) => previewLine(line, products)), [lines, products]);
  const total = previews.reduce((sum, line) => sum + line.revenue, 0);
  let paid = -1;
  try { if (tendered.trim()) paid = pesosToCentavos(tendered); } catch { paid = -1; }
  const availabilityReady = balanceSnapshot?.context === balanceContext && !balanceSnapshot.failed;
  const availabilityMessage = balanceSnapshot?.context === balanceContext && balanceSnapshot.failed ? 'Availability unavailable. Reload this page to retry.' : 'Checking availability…';
  const availability = new Map((availabilityReady ? balanceSnapshot.balances : []).map((item) => [item.productId, item.quantityPieces]));
  const valid = availabilityReady && lines.length > 0 && previews.every((item, index) => item.product && item.pieces > 0 && item.error === undefined && (lines[index].unit === 'pack' ? item.product.sellingPricePerPackCentavos : item.product.sellingPricePerPieceCentavos) > 0 && item.pieces <= (availability.get(item.product.id) ?? 0)) && Number.isSafeInteger(total) && paid >= total;

  function updateLine(index: number, changes: Partial<Line>) {
    setLines((current) => current.map((line, itemIndex) => itemIndex === index ? { ...line, ...changes } : line));
  }

  function addProduct(product: CatalogProduct) {
    const id = nextLineId.current++;
    focusLineId.current = id;
    setLines((current) => [...current, { id, productId: product.id, quantity: '', unit: 'piece' }]);
    setSearch('');
  }

  async function complete() {
    if (!valid || !selectedLocationId || paid < 0) return;
    setError(''); setSuccess(''); setSaving(true);
    try {
      const result = await api.completeSale({ locationId: selectedLocationId, paymentCentavos: paid, note: note.trim() || undefined, lines: lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity), unit: line.unit })) });
      setReceipt(result); setLines([]); setSearch(''); setTendered(''); setNote(''); setSuccess('Sale completed.');
      searchRef.current?.focus();
      onCompleted?.(result);
      try { setBalanceSnapshot({ context: balanceContext, balances: await api.getBalances(selectedLocationId) }); }
      catch { setBalanceSnapshot({ context: balanceContext, balances: [], failed: true }); setError('Sale completed, but current availability could not be refreshed.'); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The sale could not be completed.'); }
    finally { setSaving(false); }
  }

  async function voidReceipt(reason: string) {
    if (!receipt) return;
    setError(''); setVoiding(true);
    try {
      if (onVoid) await onVoid(receipt, reason);
      else setReceipt(await api.voidSale(receipt.id, reason));
      try { setBalanceSnapshot({ context: balanceContext, balances: await api.getBalances(selectedLocationId) }); }
      catch { setBalanceSnapshot({ context: balanceContext, balances: [], failed: true }); setError('Sale voided, but current availability could not be refreshed.'); }
    }
    finally { setVoiding(false); }
  }

  const paymentError = tendered.trim() && (paid < 0 ? 'Enter a valid peso amount with up to two decimal places.' : paid < total ? `Enter at least ${formatMoney(total)} to complete this sale.` : undefined);

  return <section className="catalog-page sales-page" aria-labelledby={`${formId}-title`}>
    <PageHeader eyebrow="Daily ledger · Stock out" title="New sale" titleId={`${formId}-title`} description="Find a product, enter the quantity, then collect payment." actions={locations.length > 0 && <LocationSelect locations={locations} value={selectedLocationId} onChange={updateLocation} />} />
    <form className="stock-workflow-layout sale-layout" onSubmit={(event) => { event.preventDefault(); void complete(); }}>
      <div className="sale-workflow">
        <Panel title="Find products" meta="Search by name or SKU. Press Enter to add a single matching product.">
          <Field label="Find a product" htmlFor={`${formId}-search`}>
            <input ref={searchRef} autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or SKU" onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); if (search.trim() && matches.length === 1) addProduct(matches[0]); }
            }} />
          </Field>
          {search.trim() && <div className="sale-search-results" role="region" aria-label="Product search results">{matches.length ? matches.slice(0, 8).map((product) => <Button variant="secondary" className="sale-product-tile" key={product.id} aria-label={`Add ${product.name} (${product.sku})`} aria-describedby={`${formId}-product-${product.id}-prices ${formId}-product-${product.id}-stock`} onClick={() => addProduct(product)}>
            <span className="sale-product-identity"><strong>{product.name}</strong><span className="mono">{product.sku}</span></span>
            <span id={`${formId}-product-${product.id}-prices`} className="sale-product-prices">{formatMoney(product.sellingPricePerPieceCentavos)} / piece · {formatMoney(product.sellingPricePerPackCentavos)} / pack</span>
            <span id={`${formId}-product-${product.id}-stock`} className="sale-product-availability">{availabilityReady ? `Available: ${formatQuantity(availability.get(product.id) ?? 0, product.piecesPerPack)}` : availabilityMessage}</span>
          </Button>) : <EmptyState icon="search" title="No matching products" description="Try another product name or SKU." />}</div>}
        </Panel>
        <Panel title="Order lines" meta={lines.length ? `${lines.length} ${lines.length === 1 ? 'entry' : 'entries'} · Each entered unit is kept on the receipt.` : undefined}>
          <div className="sale-order-lines">{lines.length === 0 && <EmptyState icon="sale" title="Start a new order" description="Find a product above to add your first item." />}
          {lines.map((line, index) => {
            const preview = previews[index]; const product = preview.product; const available = product ? availability.get(product.id) ?? 0 : 0;
            const unitPrice = product && (line.unit === 'piece' ? product.sellingPricePerPieceCentavos : product.sellingPricePerPackCentavos);
            const lineError = preview.error || (product && unitPrice === 0 ? 'Set a selling price before this product can be sold.' : availabilityReady && preview.pieces > available ? `Only ${available} pc available. Reduce the quantity.` : line.quantity && preview.pieces === 0 ? 'Enter a quantity greater than zero.' : undefined);
            return <fieldset className="stock-line sale-line" key={line.id}><legend>{product?.name ?? 'Product'}, line {index + 1}</legend>
              <div className="quantity-row"><Field label="Quantity" htmlFor={`${formId}-quantity-${line.id}`} error={lineError}>
                <input ref={(element) => { if (element && focusLineId.current === line.id) { element.focus(); focusLineId.current = null; } }} aria-label={`Line ${index + 1}: Quantity for ${product?.name}`} type="number" min="0.01" step="any" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} />
              </Field><Field label="Unit" htmlFor={`${formId}-unit-${line.id}`}>
                <select aria-label={`Line ${index + 1}: Unit for ${product?.name}`} value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value as Line['unit'] })}><option value="piece">Piece</option><option value="pack">Pack</option></select>
              </Field></div>
              <p className="availability-note">{availabilityReady ? `Available: ${formatQuantity(available, product?.piecesPerPack ?? 1)}` : availabilityMessage}</p>
              <div className="sale-line-footer"><span>{preview.pieces ? `${preview.pieces} pc` : '—'}</span><strong>{formatMoney(preview.revenue)}</strong><Button variant="ghost" aria-label={`Remove ${product?.name}, line ${index + 1}`} onClick={() => { setLines((current) => current.filter((_, itemIndex) => itemIndex !== index)); searchRef.current?.focus(); }}>Remove</Button></div>
            </fieldset>;
          })}</div>
        </Panel>
      </div>
      <aside className="workflow-summary sale-checkout-summary" aria-label="Current order">
        <p className="eyebrow">Checkout</p><h2>Current order</h2>
        <dl><div><dt>Items</dt><dd>{previews.reduce((sum, item) => sum + item.pieces, 0)} pc</dd></div><div className="sale-grand-total"><dt>Total</dt><dd>{formatMoney(total)}</dd></div><div><dt>Tendered</dt><dd>{paid >= 0 ? formatMoney(paid) : '—'}</dd></div><div><dt>Change</dt><dd>{paid >= total && total > 0 ? formatMoney(paid - total) : '—'}</dd></div></dl>
        <Field label="Amount tendered (₱)" htmlFor={`${formId}-tendered`} error={paymentError || undefined} hint="Enter the amount received in pesos."><input aria-label="Amount tendered" inputMode="decimal" value={tendered} onChange={(event) => setTendered(event.target.value)} /></Field>
        <Field label="Note" htmlFor={`${formId}-note`}><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} /></Field>
        {error && <InlineNotice tone="danger" title="Sale needs attention">{error}</InlineNotice>}{success && <InlineNotice tone="success" title={success} />}
        {!valid && !tendered.trim() && <p className="checkout-help">{lines.length ? 'Enter quantities and payment to complete this sale.' : 'Add a product to begin checkout.'}</p>}
        <Button variant="primary" type="submit" disabled={!valid} busy={saving} icon="sale">{saving ? 'Completing sale…' : 'Complete sale'}</Button>
      </aside>
    </form>
    {renderReceipt && receipt && <SaleReceipt receipt={receipt} onVoid={voidReceipt} voiding={voiding} />}
  </section>;
}
