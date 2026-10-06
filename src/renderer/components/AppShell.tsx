import type { ReactNode } from 'react';

const primaryNavigation = ['Dashboard', 'Sales', 'Inventory', 'Replenish', 'Transfers', 'Stock count', 'Reports'];
const secondaryNavigation = ['Products', 'Locations', 'Settings'];

export default function AppShell({ page, onNavigate, children }: { page: string; onNavigate: (page: string) => void; children: ReactNode }) {
  const link = (item: string) => <button key={item} type="button" className={`nav-link ${page === item ? 'active' : ''}`} aria-current={page === item ? 'page' : undefined} onClick={() => onNavigate(item)}>{item}</button>;
  return <div className="app-shell">
    <aside className="sidebar" aria-label="Main navigation">
      <div className="brand"><span className="brand-mark" aria-hidden="true">S</span><span>SIOMAI CART</span></div>
      <nav aria-label="Primary"><ul className="nav-list">{primaryNavigation.map((item) => <li key={item}>{link(item)}</li>)}</ul></nav>
      <nav className="nav-secondary" aria-label="Business setup">{secondaryNavigation.map(link)}</nav>
    </aside>
    <main className="workspace">
      <header className="topbar">
        <div className="context"><span><span className="context-label">Cart:</span> Business location</span><span><span className="context-label">Date:</span> Manila local</span></div>
        <button className="primary-button" type="button" onClick={() => onNavigate('Sales')}>+ New sale</button>
      </header>
      {children}
    </main>
  </div>;
}
