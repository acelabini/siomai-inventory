import { useEffect, useState, type FormEvent } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import type { CompleteSetupInput, SetupState } from '../../shared/schemas';
import { getInventoryApi } from '../api';

type SetupChoice = 'samples' | 'import' | 'manual';
type Props = { api?: InventoryApi; onComplete: (nextView?: string) => void };

export default function SetupPage({ api = getInventoryApi(), onComplete }: Props) {
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [choice, setChoice] = useState<SetupChoice>('samples');
  const [openingStock, setOpeningStock] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    void api.getSetupState().then((state) => { if (mounted) setSetup(state); });
    return () => { mounted = false; };
  }, [api]);

  if (!setup) return <main className="setup-page"><p role="status">Loading setup…</p></main>;
  const loadedSetup = setup;

  function nextFromBusiness(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!businessName.trim()) nextErrors.businessName = 'Business name is required.';
    if (!locationName.trim()) nextErrors.locationName = 'Location name is required.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) setStep(1);
  }

  async function finishSetup() {
    const nextErrors: Record<string, string> = {};
    const stock: CompleteSetupInput['openingStock'] = [];
    const productsToCreate = choice === 'samples' ? selected : [];
    for (const productId of productsToCreate) {
      const raw = openingStock[productId] ?? '0';
      const quantity = Number(raw);
      const product = loadedSetup.sampleProducts.find((item) => item.id === productId);
      if (!Number.isInteger(quantity) || quantity < 0) {
        nextErrors[`stock:${productId}`] = 'Opening stock must be zero or more whole pieces.';
      } else if (quantity > 0) {
        stock.push({ productId, quantityPieces: quantity });
      }
      if (product?.sellingPricePerPieceCentavos === 0 && product.sellingPricePerPackCentavos === 0) {
        nextErrors.sellingPrices = 'Set selling prices for selected products before recording sales.';
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).some((key) => key.startsWith('stock:'))) return;
    const input: CompleteSetupInput = {
      businessName: businessName.trim(),
      locationName: locationName.trim(),
      sampleProductIds: productsToCreate,
      openingStock: stock,
    };
    setSaving(true);
    try {
      await api.completeSetup(input);
      onComplete(choice === 'import' ? 'Import' : choice === 'manual' ? 'Products' : undefined);
    } catch (error) {
      setErrors({ submit: error instanceof Error ? error.message : 'Setup could not be completed.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="setup-page" aria-labelledby="setup-title">
      <div className="setup-panel">
        <p className="eyebrow">FIRST-RUN SETUP · {step + 1} OF 3</p>
        <h1 id="setup-title">Set up your business</h1>
        <p className="setup-intro">A few details make the daily stock ledger yours.</p>

        {step === 0 && (
          <form onSubmit={nextFromBusiness} noValidate>
            <label className="form-field" htmlFor="business-name">Business name
              <input id="business-name" value={businessName} onChange={(event) => setBusinessName(event.target.value)} />
              {errors.businessName && <span className="field-error">{errors.businessName}</span>}
            </label>
            <label className="form-field" htmlFor="location-name">Location name
              <input id="location-name" value={locationName} onChange={(event) => setLocationName(event.target.value)} />
              {errors.locationName && <span className="field-error">{errors.locationName}</span>}
            </label>
            <button className="primary-button" type="submit">Continue</button>
          </form>
        )}

        {step === 1 && (
          <section aria-labelledby="sample-products-title">
          <h2 id="sample-products-title">Choose how to add products</h2>
            <fieldset className="setup-product-list" aria-label="Product setup choice">
              <label className="setup-product-option"><input type="radio" name="product-setup-choice" value="samples" checked={choice === 'samples'} onChange={() => setChoice('samples')} /><span><strong>Use sample products</strong><small>Select from the included siomai catalog.</small></span></label>
              <label className="setup-product-option"><input type="radio" name="product-setup-choice" value="import" checked={choice === 'import'} onChange={() => setChoice('import')} /><span><strong>Import products or stock from CSV</strong><small>Business and location setup will finish first, then CSV import opens.</small></span></label>
              <label className="setup-product-option"><input type="radio" name="product-setup-choice" value="manual" checked={choice === 'manual'} onChange={() => setChoice('manual')} /><span><strong>Add products manually later</strong><small>Finish setup and open the product catalog.</small></span></label>
            </fieldset>
            {choice === 'samples' && <>
            <p>Select the items you carry. You can add or change products later.</p>
            <div className="setup-product-list">
              {loadedSetup.sampleProducts.map((product) => (
                <label className="setup-product-option" key={product.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(product.id)}
                    onChange={(event) => setSelected((current) => event.target.checked
                      ? [...current, product.id]
                      : current.filter((id) => id !== product.id))}
                  />
                  <span><strong>{product.name}</strong><small>{product.piecesPerPack} pieces per pack · ₱{(product.purchaseCostPerPackCentavos / 100).toFixed(2)} cost per pack</small></span>
                </label>
              ))}
            </div>
            <p className="setup-notice">Selling prices are not included in the source list. Set a piece or pack selling price for each selected product before recording a sale.</p>
            </>}
            <div className="form-actions">
              <button className="secondary-button" type="button" onClick={() => setStep(0)}>Back</button>
              {choice === 'samples'
                ? <button className="primary-button" type="button" onClick={() => setStep(2)}>Continue to opening stock</button>
                : <button className="primary-button" type="button" disabled={saving} onClick={() => void finishSetup()}>{saving ? 'Saving…' : choice === 'import' ? 'Complete setup and import CSV' : 'Complete setup and add products'}</button>}
            </div>
          </section>
        )}

        {step === 2 && (
          <section aria-labelledby="opening-stock-title">
            <h2 id="opening-stock-title">Opening stock</h2>
            <p>Enter the pieces currently on hand. Leave a value at zero if you are starting without stock.</p>
            {selected.length === 0 && <p>No sample products selected. You can add products after setup.</p>}
            <div className="setup-stock-list">
              {selected.map((productId) => {
                const product = loadedSetup.sampleProducts.find((item) => item.id === productId)!;
                const fieldError = errors[`stock:${productId}`];
                return <label className="form-field" htmlFor={`stock-${productId}`} key={productId}>
                  Opening pieces for {product.name}
                  <input id={`stock-${productId}`} type="number" inputMode="numeric" min="0" step="1" value={openingStock[productId] ?? '0'} aria-invalid={Boolean(fieldError)} onChange={(event) => {
                    const value = event.target.value;
                    setOpeningStock((current) => ({ ...current, [productId]: value }));
                    const quantity = Number(value);
                    setErrors((current) => ({
                      ...current,
                      [`stock:${productId}`]: value !== '' && (!Number.isInteger(quantity) || quantity < 0)
                        ? 'Opening stock must be zero or more whole pieces.'
                        : '',
                    }));
                  }} />
                  {fieldError && <span className="field-error">{fieldError}</span>}
                </label>;
              })}
            </div>
            {errors.sellingPrices && <p className="setup-notice" role="note">{errors.sellingPrices}</p>}
            {errors.submit && <p className="field-error" role="alert">{errors.submit}</p>}
            <div className="form-actions">
              <button className="secondary-button" type="button" onClick={() => setStep(1)}>Back</button>
              <button className="primary-button" type="button" disabled={saving} onClick={() => void finishSetup()}>{saving ? 'Saving…' : 'Finish setup'}</button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
