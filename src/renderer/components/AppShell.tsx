import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetId = useId();
  const sheetTitleId = useId();
  const secondaryActive = navigationGroups.slice(1).some((group) => group.items.some((item) => item.view === page));

  useLayoutEffect(() => {
    if (!moreOpen) return;
    const sheet = sheetRef.current!;
    const trigger = moreRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => Array.from(sheet.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const focusFirst = () => controls()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMoreOpen(false); }
      if (event.key !== 'Tab') return;
      const buttons = controls();
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !sheet.contains(event.target)) focusFirst();
    };
    // A sheet opened on a phone must not leave the desktop shell inert after rotation/resizing.
    const desktop = window.matchMedia?.('(min-width: 761px)');
    const onDesktop = () => { if (desktop?.matches) setMoreOpen(false); };
    desktop?.addEventListener('change', onDesktop);
    focusFirst();
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocus);
      desktop?.removeEventListener('change', onDesktop);
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [moreOpen]);

  function navigate(view: string) { onNavigate(view); setMoreOpen(false); }

  return <><div className="app-shell" inert={moreOpen || undefined}>
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
    <nav className="mobile-order-rail" aria-label="Mobile primary">
      {navigationGroups[0].items.map((item) => <button key={item.view} type="button" className="mobile-rail-button"
        aria-current={page === item.view ? 'page' : undefined} onClick={() => navigate(item.view)}>
        <AppIcon name={item.icon} size={20} /><span>{item.label}</span>
      </button>)}
      <button ref={moreRef} type="button" className="mobile-rail-button" aria-haspopup="dialog" aria-expanded={moreOpen}
        aria-controls={moreOpen ? sheetId : undefined} aria-current={secondaryActive ? 'true' : undefined} onClick={() => setMoreOpen(true)}>
        <AppIcon name="more" size={20} /><span>More</span>
      </button>
    </nav>
  </div>
  {moreOpen && createPortal(<div className="mobile-sheet-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setMoreOpen(false); }}>
    <div ref={sheetRef} id={sheetId} role="dialog" aria-modal="true" aria-labelledby={sheetTitleId} className="mobile-navigation-sheet">
      <header className="mobile-sheet-heading"><h2 id={sheetTitleId}>More destinations</h2>
        <Button variant="ghost" icon="close" aria-label="Close navigation" onClick={() => setMoreOpen(false)} />
      </header>
      <nav aria-label="More destinations">{navigationGroups.slice(1).map((group) => <section key={group.label} className="mobile-sheet-group" aria-label={group.label}>
        <h3>{group.label}</h3>
        <ul>{group.items.map((item) => <li key={item.view}><button type="button" aria-current={page === item.view ? 'page' : undefined} onClick={() => navigate(item.view)}>
          <AppIcon name={item.icon} /><span>{item.label}</span>{page === item.view && <AppIcon name="check" size={16} />}
        </button></li>)}</ul>
      </section>)}</nav>
    </div>
  </div>, document.body)}
  </>;
}
