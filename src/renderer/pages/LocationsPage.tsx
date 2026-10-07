import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import type { CatalogLocation, InventoryBalance } from '../../shared/schemas';
import { getInventoryApi } from '../api';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import Field from '../components/ui/Field';
import InlineNotice from '../components/ui/InlineNotice';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatusBadge from '../components/ui/StatusBadge';

export type LocationSummary = { location: CatalogLocation; totalPieces: number; productCount: number };
type Props = { api?: InventoryApi; activeLocationId?: string };

export default function LocationsPage({ api = getInventoryApi(), activeLocationId }: Props) {
  const [summaries, setSummaries] = useState<LocationSummary[]>([]);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [formOpen, setFormOpen] = useState(false);
  const [archivingLocation, setArchivingLocation] = useState<CatalogLocation | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      const locations = await api.listLocations();
      const nextSummaries = await Promise.all(locations.map(async (location) => {
        const balances: InventoryBalance[] = await api.getBalances(location.id);
        const stockedBalances = balances.filter((balance) => balance.quantityPieces > 0);
        return {
          location,
          totalPieces: balances.reduce((total, balance) => total + balance.quantityPieces, 0),
          productCount: stockedBalances.length,
        };
      }));
      setSummaries(nextSummaries);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Locations and stock summaries could not be loaded.');
    }
  }
  useEffect(() => { void refresh(); }, [api]);
  useEffect(() => { if (formOpen) nameInputRef.current?.focus(); }, [formOpen]);

  function closeForm() {
    setName(''); setEditingId(undefined); setFormOpen(false);
  }

  function addLocation() {
    setError(''); setMessage(''); setName(''); setEditingId(undefined); setFormOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      await api.saveLocation({ ...(editingId ? { id: editingId } : {}), name });
      closeForm(); await refresh(); setMessage('Location saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Location could not be saved.'); }
  }

  async function archive() {
    if (!archivingLocation) return;
    try {
      await api.archiveLocation(archivingLocation.id);
      setArchivingLocation(null); await refresh(); setMessage('Location archived. Its stock and transaction history will be kept.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Location could not be archived.'); }
  }

  return <main className="catalog-page redesigned-catalog-page" aria-labelledby="locations-title">
    <PageHeader eyebrow="Catalog" title="Locations" titleId="locations-title" description="Review the stock held at each cart or storage point." actions={<Button variant="primary" icon="plus" onClick={addLocation}>Add location</Button>} />
    {error && !formOpen && !archivingLocation && <InlineNotice tone="danger" title="Location action failed">{error}</InlineNotice>}
    {message && <InlineNotice tone="success" title={message} />}
    {formOpen && <Panel title={editingId ? 'Edit location' : 'Add a location'} className="location-editor">
      <form onSubmit={(event) => void save(event)}>
        <Field label="Location name" htmlFor="location-name" required><input ref={nameInputRef} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></Field>
        {error && <p role="alert" className="field-error location-form-error">{error}</p>}
        <div className="form-actions"><Button variant="primary" type="submit">Save location</Button><Button variant="secondary" onClick={closeForm}>Cancel</Button></div>
      </form>
    </Panel>}
    <Panel title="Location summaries" meta={`${summaries.length} active ${summaries.length === 1 ? 'location' : 'locations'}`} className="location-summary-panel">
      {summaries.length ? <div className="location-summary-grid">{summaries.map(({ location, totalPieces, productCount }) => {
        const isCurrent = location.id === activeLocationId;
        return <article className="location-summary-card" key={location.id}>
          <div className="location-summary-heading"><div><h2 title={location.name}>{location.name}</h2>{isCurrent && <StatusBadge tone="success">Current location</StatusBadge>}</div>
            <div className="catalog-row-actions"><Button variant="ghost" aria-label={`Edit ${location.name}`} onClick={() => { setEditingId(location.id); setName(location.name); setError(''); setMessage(''); setFormOpen(true); }}>Edit</Button><Button variant="danger" icon="archive" aria-label={`Archive ${location.name}`} onClick={() => setArchivingLocation(location)}>Archive</Button></div>
          </div>
          <dl className="location-summary-metrics"><div><dt>Products in stock</dt><dd>{productCount} {productCount === 1 ? 'product' : 'products'}</dd></div><div><dt>Total pieces</dt><dd>{totalPieces} pc</dd></div></dl>
        </article>;
      })}</div> : <EmptyState icon="locations" title="No active locations" description="Add a location to keep stock balances organized." actions={<Button variant="primary" icon="plus" onClick={addLocation}>Add location</Button>} />}
    </Panel>
    <ConfirmDialog open={Boolean(archivingLocation)} title={`Archive ${archivingLocation?.name ?? 'location'}?`} description="Archive this location only if at least one other active location remains. Its stock and transaction history will be kept." confirmLabel="Archive location" onConfirm={() => void archive()} onCancel={() => setArchivingLocation(null)}>
      {error && archivingLocation && <p className="field-error dialog-error" role="alert" tabIndex={0}>{error} You can retry or cancel.</p>}
      {archivingLocation && <p className="dialog-long-name" title={archivingLocation.name}>{archivingLocation.name}</p>}
    </ConfirmDialog>
  </main>;
}
