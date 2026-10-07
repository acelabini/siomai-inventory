import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import type { CatalogProduct } from '../../shared/schemas';
import { getInventoryApi } from '../api';
import DataTable from '../components/DataTable';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import Field from '../components/ui/Field';
import InlineNotice from '../components/ui/InlineNotice';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import { formatMoney } from './stock-shared';

type Props = { api?: InventoryApi };
type VisibilityFilter = 'active' | 'archived';

function centavosToInput(centavos: number): string {
  return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, '0')}`;
}

function pesosToCentavos(pesos: string): number | null {
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(pesos.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const centavos = whole * 100 + fraction;
  return Number.isSafeInteger(centavos) ? centavos : null;
}

export default function ProductsPage({ api = getInventoryApi() }: Props) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('active');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [formOpen, setFormOpen] = useState(false);
  const [archivingProduct, setArchivingProduct] = useState<CatalogProduct | null>(null);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [piecesPerPack, setPiecesPerPack] = useState('1');
  const [purchaseCost, setPurchaseCost] = useState('0.00');
  const [piecePrice, setPiecePrice] = useState('0.00');
  const [packPrice, setPackPrice] = useState('0.00');
  const [lowStockThresholdPieces, setLowStockThresholdPieces] = useState('0');
  const nameInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      setProducts(await api.listProducts({ includeArchived: true }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Products could not be loaded.');
    }
  }
  useEffect(() => { void refresh(); }, [api]);
  useEffect(() => { if (formOpen) nameInputRef.current?.focus(); }, [formOpen]);

  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesVisibility = visibilityFilter === 'active' ? product.isActive : !product.isActive;
    const query = search.trim().toLocaleLowerCase();
    return matchesVisibility && (!query || `${product.name} ${product.sku}`.toLocaleLowerCase().includes(query));
  }), [products, search, visibilityFilter]);

  function resetForm() {
    setEditingId(undefined); setName(''); setSku(''); setPiecesPerPack('1');
    setPurchaseCost('0.00'); setPiecePrice('0.00'); setPackPrice('0.00');
    setLowStockThresholdPieces('0'); setFormOpen(false);
  }

  function addProduct() {
    setError(''); setMessage(''); setVisibilityFilter('active'); setSearch(''); resetForm(); setFormOpen(true);
  }

  function edit(product: CatalogProduct) {
    setEditingId(product.id); setName(product.name); setSku(product.sku);
    setPiecesPerPack(String(product.piecesPerPack));
    setPurchaseCost(centavosToInput(product.purchaseCostPerPackCentavos));
    setPiecePrice(centavosToInput(product.sellingPricePerPieceCentavos));
    setPackPrice(centavosToInput(product.sellingPricePerPackCentavos));
    setLowStockThresholdPieces(String(product.lowStockThresholdPieces));
    setError(''); setMessage(''); setFormOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    const threshold = Number(lowStockThresholdPieces);
    const purchaseCostCentavos = pesosToCentavos(purchaseCost);
    const piecePriceCentavos = pesosToCentavos(piecePrice);
    const packPriceCentavos = pesosToCentavos(packPrice);
    if (!Number.isSafeInteger(threshold) || threshold < 0) {
      setError('Low-stock threshold must be a nonnegative whole number of pieces.');
      return;
    }
    if (purchaseCostCentavos === null || piecePriceCentavos === null || packPriceCentavos === null) {
      setError('Enter prices in pesos with up to two decimal places.');
      return;
    }
    try {
      await api.saveProduct({
        ...(editingId ? { id: editingId } : {}),
        name, sku, piecesPerPack: Number(piecesPerPack),
        purchaseCostPerPackCentavos: purchaseCostCentavos,
        sellingPricePerPieceCentavos: piecePriceCentavos,
        sellingPricePerPackCentavos: packPriceCentavos,
        lowStockThresholdPieces: threshold,
      });
      resetForm(); await refresh(); setMessage('Product saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Product could not be saved.'); }
  }

  async function archive() {
    if (!archivingProduct) return;
    try {
      await api.archiveProduct(archivingProduct.id);
      setArchivingProduct(null); await refresh(); setMessage('Product archived. Existing stock and sales history will be kept.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Product could not be archived.'); }
  }

  const columns = [
    { key: 'name', label: 'Product', render: (product: CatalogProduct) => <span className="catalog-long-name" title={product.name} aria-label={product.name}>{product.name}</span> },
    { key: 'sku', label: 'SKU', render: (product: CatalogProduct) => <span className="mono">{product.sku}</span> },
    { key: 'pack', label: 'Pack size', numeric: true, render: (product: CatalogProduct) => `${product.piecesPerPack} pc` },
    { key: 'cost', label: 'Purchase cost / pack', numeric: true, render: (product: CatalogProduct) => formatMoney(product.purchaseCostPerPackCentavos) },
    { key: 'price', label: 'Selling price / piece', numeric: true, render: (product: CatalogProduct) => product.sellingPricePerPieceCentavos === 0 && product.sellingPricePerPackCentavos === 0 ? <span className="price-warning">Set price before sale</span> : formatMoney(product.sellingPricePerPieceCentavos) },
    { key: 'actions', label: 'Actions', render: (product: CatalogProduct) => product.isActive
      ? <div className="catalog-row-actions"><Button variant="ghost" onClick={() => edit(product)}>Edit</Button><Button variant="danger" icon="archive" aria-label={`Archive ${product.name}`} onClick={() => setArchivingProduct(product)}>Archive</Button></div>
      : <span className="archived-label">Archived</span> },
  ];

  return <main className="catalog-page redesigned-catalog-page" aria-labelledby="products-title">
    <PageHeader eyebrow="Catalog" title="Products" titleId="products-title" description="Manage the items and prices used across sales and stock records." actions={<Button variant="primary" icon="plus" onClick={addProduct}>Add product</Button>} />
    {error && !formOpen && !archivingProduct && <InlineNotice tone="danger" title="Product action failed">{error}</InlineNotice>}
    {message && <InlineNotice tone="success" title={message} />}
    {formOpen && <Panel title={editingId ? 'Edit product' : 'Add a product'} className="catalog-editor">
      <form className="catalog-editor-grid" onSubmit={(event) => void save(event)}>
        <Field label="Product name" htmlFor="product-name" required><input ref={nameInputRef} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></Field>
        <Field label="SKU" htmlFor="product-sku" required><input value={sku} onChange={(event) => setSku(event.target.value)} maxLength={120} required /></Field>
        <Field label="Pieces per pack" htmlFor="product-pieces-per-pack" required><input type="number" min="1" step="1" value={piecesPerPack} onChange={(event) => setPiecesPerPack(event.target.value)} required /></Field>
        <Field label="Purchase cost per pack (pesos)" htmlFor="product-cost" hint="Enter pesos, including centavos, such as 125.50." required><input type="number" min="0" step="0.01" value={purchaseCost} onChange={(event) => setPurchaseCost(event.target.value)} required /></Field>
        <Field label="Selling price per piece (pesos)" htmlFor="product-piece-price" hint="Enter pesos, including centavos, such as 12.50." required><input type="number" min="0" step="0.01" value={piecePrice} onChange={(event) => setPiecePrice(event.target.value)} required /></Field>
        <Field label="Selling price per pack (pesos)" htmlFor="product-pack-price" required><input type="number" min="0" step="0.01" value={packPrice} onChange={(event) => setPackPrice(event.target.value)} required /></Field>
        <Field label="Low-stock threshold (pieces)" htmlFor="product-threshold" required><input type="number" min="0" step="1" value={lowStockThresholdPieces} onChange={(event) => setLowStockThresholdPieces(event.target.value)} required /></Field>
        {error && <p role="alert" className="field-error catalog-form-error">{error}</p>}
        <div className="form-actions catalog-editor-actions"><Button variant="primary" type="submit">Save product</Button><Button variant="secondary" onClick={resetForm}>Cancel</Button></div>
      </form>
    </Panel>}
    <Panel title="Product list" meta={`${visibleProducts.length} ${visibilityFilter} ${visibleProducts.length === 1 ? 'product' : 'products'}`} className="catalog-list-panel" actions={<div className="catalog-filters">
      <label className="catalog-search">Search products<input type="search" aria-label="Search products" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or SKU" /></label>
      <fieldset className="visibility-filter"><legend>Visibility</legend><label><input type="radio" name="product-visibility" checked={visibilityFilter === 'active'} onChange={() => setVisibilityFilter('active')} />Active</label><label><input type="radio" name="product-visibility" checked={visibilityFilter === 'archived'} onChange={() => setVisibilityFilter('archived')} />Archived</label></fieldset>
    </div>}>
      <DataTable label="Products" columns={columns} rows={visibleProducts} rowKey={(product) => product.id} className="catalog-data-table" empty={visibilityFilter === 'active' ? 'No active products match this search.' : 'No archived products match this search.'} />
      {products.length === 0 && <EmptyState icon="products" title="No products yet" description="Add the products your cart sells to start tracking stock and sales." actions={<Button variant="primary" icon="plus" onClick={addProduct}>Add product</Button>} />}
    </Panel>
    <ConfirmDialog open={Boolean(archivingProduct)} title={`Archive ${archivingProduct?.name ?? 'product'}?`} description="The product will no longer appear in active lists. Existing stock, sale, and movement history will be kept." confirmLabel="Archive product" onConfirm={() => void archive()} onCancel={() => setArchivingProduct(null)}>
      {error && archivingProduct && <p className="field-error dialog-error" role="alert" tabIndex={0}>{error} You can retry or cancel.</p>}
      {archivingProduct && <p className="dialog-long-name" title={archivingProduct.name}>{archivingProduct.name}</p>}
    </ConfirmDialog>
  </main>;
}
