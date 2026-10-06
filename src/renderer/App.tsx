import { useEffect, useState } from 'react';
import type { InventoryApi } from '../shared/contracts';
import { getInventoryApi } from './api';
import LocationsPage from './pages/LocationsPage';
import InventoryPage from './pages/InventoryPage';
import ProductsPage from './pages/ProductsPage';
import ReplenishPage from './pages/ReplenishPage';
import StockCountPage from './pages/StockCountPage';
import SetupPage from './pages/SetupPage';
import TransfersPage from './pages/TransfersPage';
import './styles.css';

const navigation = [
  'Today',
  'Sales',
  'Inventory',
  'Replenish',
  'Transfers',
  'Stock count',
  'Reports',
];

export default function App({ api = getInventoryApi() }: { api?: InventoryApi } = {}) {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [view, setView] = useState('Today');

  useEffect(() => {
    let mounted = true;
    void api.getSetupState().then((state) => { if (mounted) setSetupComplete(state.complete); });
    return () => { mounted = false; };
  }, [api]);

  if (setupComplete === null) return <main className="setup-page"><p role="status">Loading local ledger…</p></main>;
  if (!setupComplete) return <SetupPage api={api} onComplete={() => setSetupComplete(true)} />;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SIOMAI CART</span>
        </div>
        <nav>
          <ul className="nav-list">
            {navigation.map((item) => (
              <li key={item}>
                <a className={view === item ? 'nav-link active' : 'nav-link'} href="#" onClick={(event) => { event.preventDefault(); setView(item); }}>
                  {item}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="nav-secondary">
          <a className={view === 'Products' ? 'nav-link active' : 'nav-link'} href="#" onClick={(event) => { event.preventDefault(); setView('Products'); }}>Products</a>
          <a className={view === 'Locations' ? 'nav-link active' : 'nav-link'} href="#" onClick={(event) => { event.preventDefault(); setView('Locations'); }}>Locations</a>
          <a className="nav-link" href="#" onClick={(event) => event.preventDefault()}>Settings</a>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="context">
            <span><span className="context-label">Cart:</span> Main Cart</span>
            <span><span className="context-label">Date:</span> Today</span>
          </div>
          <button className="primary-button" type="button" disabled>
            + New sale
          </button>
        </header>

        {view === 'Products' ? <ProductsPage api={api} /> : view === 'Locations' ? <LocationsPage api={api} /> : view === 'Inventory' ? <InventoryPage api={api} /> : view === 'Replenish' ? <ReplenishPage api={api} /> : view === 'Transfers' ? <TransfersPage api={api} /> : view === 'Stock count' ? <StockCountPage api={api} /> : <section className="ledger-page" aria-labelledby="page-title">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Tuesday · Main Cart</p>
              <h1 id="page-title">Today’s ledger</h1>
            </div>
            <span className="status-pill"><span className="status-dot" /> Local ledger</span>
          </div>

          <section className="ledger-ribbon" aria-label="Stock movement sequence">
            <span>Opening</span><span aria-hidden="true">→</span>
            <span>Replenished</span><span aria-hidden="true">→</span>
            <span>Sold</span><span aria-hidden="true">→</span>
            <strong>On hand</strong>
          </section>

          <section className="empty-ledger" aria-label="Ledger preview">
            <p className="empty-kicker">DAILY STOCK LEDGER</p>
            <h2>Your daily stock, clearly accounted for.</h2>
            <p>Opening stock → replenished → sold → on hand</p>
            <div className="empty-rule" />
            <div className="empty-columns" aria-hidden="true">
              <span>PRODUCT</span><span>START</span><span>IN</span>
              <span>SOLD</span><span>ON HAND</span><span>VALUE</span>
            </div>
            <div className="empty-note">Your product ledger will appear here.</div>
          </section>
        </section>}
      </main>
    </div>
  );
}
