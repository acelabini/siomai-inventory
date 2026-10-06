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

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SIOMAI CART</span>
        </div>
        <nav>
          <ul className="nav-list">
            {navigation.map((item, index) => (
              <li key={item}>
                <a className={index === 0 ? 'nav-link active' : 'nav-link'} href="#">
                  {item}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="nav-secondary">
          <a className="nav-link" href="#">Products</a>
          <a className="nav-link" href="#">Locations</a>
          <a className="nav-link" href="#">Settings</a>
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

        <section className="ledger-page" aria-labelledby="page-title">
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
        </section>
      </main>
    </div>
  );
}
