import type { ReactNode } from 'react';
import type { CatalogLocation } from '../../shared/schemas';
import AppIcon, { type IconName } from './ui/AppIcon';
import Button from './ui/Button';

const navigationGroups: Array<{ label: string; items: Array<{ label: string; view: string; icon: IconName }> }> = [
  { label: 'Today', items: [
    { label: 'Overview', view: 'Dashboard', icon: 'overview' },
    { label: 'New sale', view: 'Sales', icon: 'sale' },
    { label: 'Inventory', view: 'Inventory', icon: 'inventory' },
  ] },
  { label: 'Stock operations', items: [
    { label: 'Replenish', view: 'Replenish', icon: 'replenish' },
    { label: 'Transfers', view: 'Transfers', icon: 'transfer' },
    { label: 'Stock count', view: 'Stock count', icon: 'count' },
  ] },
  { label: 'Review', items: [
    { label: 'Reports', view: 'Reports', icon: 'reports' },
    { label: 'Products', view: 'Products', icon: 'products' },
    { label: 'Locations', view: 'Locations', icon: 'locations' },
    { label: 'Import data', view: 'Import', icon: 'import' },
    { label: 'Settings', view: 'Settings', icon: 'settings' },
  ] },
];

export default function AppShell({ page, onNavigate, locations, locationId, date, onLocationChange, onDateChange, children }: {
  page: string; onNavigate: (page: string) => void; locations: CatalogLocation[]; locationId: string; date: string;
  onLocationChange: (locationId: string) => void; onDateChange: (date: string) => void; children: ReactNode;
}) {
  const currentLocation = locations.find((location) => location.id === locationId);
  return <div className="app-shell">
    <aside className="sidebar" aria-label="Main navigation">
      <div className="brand" title="Siomai Cart"><span className="brand-mark" aria-hidden="true">S</span><span className="brand-name">SIOMAI CART</span></div>
      <nav className="rail-navigation" aria-label="Primary">
        {navigationGroups.map((group, index) => <section key={group.label} className={`nav-group${group.label === 'Review' ? ' nav-group-review' : ''}`} role="group" aria-labelledby={`navigation-group-${index}`}>
          <h2 id={`navigation-group-${index}`} className="nav-group-label">{group.label}</h2>
          <ul className="nav-list">{group.items.map((item) => <li key={item.view} className={item.view === 'Import' ? 'nav-footer-start' : undefined}>
            <button type="button" className={`nav-link${page === item.view ? ' active' : ''}`} title={item.label}
              aria-current={page === item.view ? 'page' : undefined} onClick={() => onNavigate(item.view)}>
              <AppIcon name={item.icon} /><span className="nav-link-label">{item.label}</span>
            </button>
          </li>)}</ul>
        </section>)}
      </nav>
      <p className="rail-context"><AppIcon name="check" size={14} /><span>Offline ledger</span></p>
    </aside>
    <main className="workspace">
      <header className="topbar">
        <div className="context">
          <label className="context-control context-location"><span className="context-label">Location</span><select aria-label="Current location" title={currentLocation?.name} value={locationId} disabled={!locations.length} onChange={(event) => onLocationChange(event.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label className="context-control context-date"><span className="context-label">Business date</span><input aria-label="Global business date" type="date" value={date} onChange={(event) => onDateChange(event.target.value)} /></label>
        </div>
        <Button variant="primary" icon="plus" className="global-sale-action" onClick={() => onNavigate('Sales')}>New sale</Button>
      </header>
      {children}
    </main>
  </div>;
}
