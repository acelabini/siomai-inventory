import { useEffect, useState, type FormEvent } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import type { CatalogLocation } from '../../shared/schemas';
import { getInventoryApi } from '../api';

type Props = { api?: InventoryApi };

export default function LocationsPage({ api = getInventoryApi() }: Props) {
  const [locations, setLocations] = useState<CatalogLocation[]>([]);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [error, setError] = useState('');
  async function refresh() { setLocations(await api.listLocations()); }
  useEffect(() => { void refresh(); }, [api]);

  async function save(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      await api.saveLocation({ ...(editingId ? { id: editingId } : {}), name });
      setName(''); setEditingId(undefined); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Location could not be saved.'); }
  }

  async function archive(location: CatalogLocation) {
    if (!window.confirm(`Archive ${location.name}?`)) return;
    try { await api.archiveLocation(location.id); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Location could not be archived.'); }
  }

  return <section className="catalog-page" aria-labelledby="locations-title">
    <div className="page-heading"><div><p className="eyebrow">CATALOG</p><h1 id="locations-title">Locations</h1></div></div>
    <div className="location-layout">
      <form className="catalog-form" onSubmit={(event) => void save(event)}>
        <h2>{editingId ? 'Edit location' : 'Add a location'}</h2>
        <label className="form-field">Location name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        {error && <p role="alert" className="field-error">{error}</p>}
        <div className="form-actions"><button className="primary-button" type="submit">Save location</button>{editingId && <button className="secondary-button" type="button" onClick={() => { setName(''); setEditingId(undefined); }}>Cancel</button>}</div>
      </form>
      <div className="location-list"><h2>Active locations</h2>{locations.map((location) => <div className="location-row" key={location.id}><strong>{location.name}</strong><span><button className="text-button" type="button" onClick={() => { setEditingId(location.id); setName(location.name); }}>Edit</button><button className="text-button destructive" type="button" onClick={() => void archive(location)}>Archive</button></span></div>)}</div>
    </div>
  </section>;
}
