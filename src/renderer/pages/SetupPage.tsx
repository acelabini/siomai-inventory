import { useEffect, useState, type FormEvent } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import type { CompleteSetupInput, SetupState } from '../../shared/schemas';
import { getInventoryApi } from '../api';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import InlineNotice from '../components/ui/InlineNotice';

type SetupStep = 0 | 1 | 2;
const setupSteps: Array<{ step: SetupStep; label: string }> = [
  { step: 0, label: 'Business and location' },
  { step: 1, label: 'Product source' },
  { step: 2, label: 'Opening stock' },
];

type SetupChoice = 'samples' | 'import' | 'manual';
type Props = { api?: InventoryApi; initialSetup?: SetupState; onComplete: (nextView?: string) => void };

export default function SetupPage({ api = getInventoryApi(), initialSetup, onComplete }: Props) {
  const [setup, setSetup] = useState<SetupState | null>(initialSetup ?? null);
  const [businessName, setBusinessName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [choice, setChoice] = useState<SetupChoice>('samples');
  const [openingStock, setOpeningStock] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<SetupStep>(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialSetup) return;
    let mounted = true;
    void api.getSetupState().then((state) => { if (mounted) setSetup(state); });
    return () => { mounted = false; };
  }, [api, initialSetup]);

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
      <div className="setup-layout">
        <aside className="setup-welcome">
          <p className="eyebrow">FIRST-RUN SETUP</p>
          <h1 id="setup-title">Set up your business</h1>
          <p className="setup-intro">A few details make the daily stock ledger yours.</p>
          <InlineNotice tone="neutral" title="Your records stay on this computer">
            Siomai Inventory works offline. Your business and stock data are saved locally on this device.
          </InlineNotice>
          <p className="setup-welcome-detail">You can update products and locations later in Settings. No account or internet connection is required.</p>
        </aside>
        <div className="setup-panel">
          <ol className="setup-progress" aria-label="Setup steps">
            {setupSteps.map(({ step: itemStep, label }, index) => {
              const state = itemStep === step ? 'current' : itemStep < step ? 'completed' : 'upcoming';
              return <li key={label} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
                <span className="setup-step-number" aria-hidden="true">{state === 'completed' ? '✓' : index + 1}</span>
                <span>{label}</span>
              </li>;
            })}
          </ol>
          <p className="eyebrow setup-step-kicker">STEP {step + 1} OF 3</p>

        {step === 0 && (
          <form onSubmit={nextFromBusiness} noValidate>
            <Field label="Business name" htmlFor="business-name" required error={errors.businessName}>
              <input value={businessName} onChange={(event) => setBusinessName(event.target.value)} />
            </Field>
            <Field label="Location name" htmlFor="location-name" required error={errors.locationName}>
              <input value={locationName} onChange={(event) => setLocationName(event.target.value)} />
            </Field>
            <Button variant="primary" type="submit">Continue</Button>
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
              <Button variant="secondary" onClick={() => setStep(0)}>Back</Button>
              {choice === 'samples'
                ? <Button variant="primary" onClick={() => setStep(2)}>Continue to opening stock</Button>
                : <Button variant="primary" busy={saving} onClick={() => void finishSetup()}>{saving ? 'Saving…' : choice === 'import' ? 'Complete setup and import CSV' : 'Complete setup and add products'}</Button>}
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
                return <Field label={`Opening pieces for ${product.name}`} htmlFor={`stock-${productId}`} key={productId} error={fieldError} hint={`Enter whole pieces currently on hand. ${product.piecesPerPack} pieces per pack.`}>
                  <input type="number" inputMode="numeric" min="0" step="1" value={openingStock[productId] ?? '0'} onChange={(event) => {
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
                </Field>;
              })}
            </div>
            {errors.sellingPrices && <InlineNotice tone="warning" title="Selling prices are needed">{errors.sellingPrices}</InlineNotice>}
            {errors.submit && <InlineNotice tone="danger" title="Setup could not be completed">{errors.submit}</InlineNotice>}
            <div className="form-actions">
              <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
              <Button variant="primary" busy={saving} onClick={() => void finishSetup()}>{saving ? 'Saving…' : 'Finish setup'}</Button>
            </div>
          </section>
        )}
        </div>
      </div>
    </main>
  );
}
