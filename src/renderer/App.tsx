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
import SalesPage from './pages/SalesPage';
import DashboardPage from './pages/DashboardPage';
import ReportsPage from './pages/ReportsPage';
import AppShell from './components/AppShell';
import './styles.css';

export default function App({ api = getInventoryApi() }: { api?: InventoryApi } = {}) {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [view, setView] = useState('Dashboard');

  useEffect(() => {
    let mounted = true;
    void api.getSetupState().then((state) => { if (mounted) setSetupComplete(state.complete); });
    return () => { mounted = false; };
  }, [api]);

  if (setupComplete === null) return <main className="setup-page"><p role="status">Loading local ledger…</p></main>;
  if (!setupComplete) return <SetupPage api={api} onComplete={() => setSetupComplete(true)} />;

  let page;
  if (view === 'Sales') page = <SalesPage api={api} />;
  else if (view === 'Products') page = <ProductsPage api={api} />;
  else if (view === 'Locations') page = <LocationsPage api={api} />;
  else if (view === 'Inventory') page = <InventoryPage api={api} />;
  else if (view === 'Replenish') page = <ReplenishPage api={api} />;
  else if (view === 'Transfers') page = <TransfersPage api={api} />;
  else if (view === 'Stock count') page = <StockCountPage api={api} />;
  else if (view === 'Reports') page = <ReportsPage api={api} />;
  else if (view === 'Settings') page = <section className="catalog-page"><h1>Settings</h1><p>Local business settings will be available here.</p></section>;
  else page = <DashboardPage api={api} onNavigate={setView} />;
  return <AppShell page={view} onNavigate={setView}>{page}</AppShell>;
}
