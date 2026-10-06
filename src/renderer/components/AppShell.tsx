import type { ReactNode } from 'react';
import type { CatalogLocation } from '../../shared/schemas';

const primaryNavigation = ['Dashboard', 'Sales', 'Inventory', 'Replenish', 'Transfers', 'Stock count', 'Reports'];
const secondaryNavigation = ['Products', 'Locations', 'Settings'];

export default function AppShell({ page, onNavigate, locations, locationId, date, onLocationChange, onDateChange, children }: {
  page: string; onNavigate: (page: string) => void; locations: CatalogLocation[]; locationId: string; date: string;
  onLocationChange: (locationId: string) => void; onDateChange: (date: string) => void; children: ReactNode;
}) {
  const link = (item: string) => <button key={item} type="button" className={`nav-link ${page === item ? 'active' : ''}`} aria-current={page === item ? 'page' : undefined} onClick={() => onNavigate(item)}>{item}</button>;
  return <div className="app-shell">
    <aside className="sidebar" aria-label="Main navigation">
      <div className="brand"><span className="brand-mark" aria-hidden="true">S</span><span>SIOMAI CART</span></div>
      <nav aria-label="Primary"><ul className="nav-list">{primaryNavigation.map((item) => <li key={item}>{link(item)}</li>)}</ul></nav>
      <nav className="nav-secondary" aria-label="Business setup">{secondaryNavigation.map(link)}</nav>
    </aside>
    <main className="workspace">
      <header className="topbar">
        <div className="context">
          <label className="context-control"><span className="context-label">Cart:</span><select aria-label="Current location" value={locationId} disabled={!locations.length} onChange={(event) => onLocationChange(event.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label className="context-control"><span className="context-label">Date:</span><input aria-label="Global business date" type="date" value={date} onChange={(event) => onDateChange(event.target.value)} /></label>
        </div>
        <button className="primary-button" type="button" onClick={() => onNavigate('Sales')}>+ New sale</button>
      </header>
      {children}
    </main>
  </div>;
}
