import { useEffect, useState } from 'react';
import type { InventoryApi } from '../shared/contracts';
import type { CatalogLocation } from '../shared/schemas';
import { getInventoryApi } from './api';
import LocationsPage from './pages/LocationsPage';
import InventoryPage from './pages/InventoryPage';
import ProductsPage from './pages/ProductsPage';
import ReplenishPage from './pages/ReplenishPage';
import StockCountPage from './pages/StockCountPage';
import SetupPage from './pages/SetupPage';
import ImportPage from './pages/ImportPage';
import TransfersPage from './pages/TransfersPage';
import SalesPage from './pages/SalesPage';
import DashboardPage from './pages/DashboardPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import AppShell from './components/AppShell';
import './styles.css';

function manilaToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export default function App({ api = getInventoryApi() }: { api?: InventoryApi } = {}) {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [view, setView] = useState('Dashboard');
  const [locations, setLocations] = useState<CatalogLocation[]>([]);
  const [locationId, setLocationId] = useState('');
  const [businessDate, setBusinessDate] = useState(manilaToday);

  useEffect(() => {
    let mounted = true;
    void api.getSetupState().then((state) => { if (mounted) setSetupComplete(state.complete); });
    return () => { mounted = false; };
  }, [api]);

  useEffect(() => {
    if (setupComplete !== true) return;
    let mounted = true;
    void api.listLocations().then((items) => {
      if (!mounted) return;
      setLocations(items);
      setLocationId((current) => current || items[0]?.id || '');
    });
    return () => { mounted = false; };
  }, [api, setupComplete]);

  if (setupComplete === null) return <main className="setup-page"><p role="status">Loading local ledger…</p></main>;
  if (!setupComplete) return <SetupPage api={api} onComplete={() => setSetupComplete(true)} />;

  let page;
  if (view === 'Sales') page = <SalesPage api={api} activeLocationId={locationId} onLocationChange={setLocationId} />;
  else if (view === 'Products') page = <ProductsPage api={api} />;
  else if (view === 'Locations') page = <LocationsPage api={api} />;
  else if (view === 'Inventory') page = <InventoryPage api={api} activeLocationId={locationId} onLocationChange={setLocationId} />;
  else if (view === 'Replenish') page = <ReplenishPage api={api} activeLocationId={locationId} onLocationChange={setLocationId} />;
  else if (view === 'Transfers') page = <TransfersPage api={api} activeLocationId={locationId} onLocationChange={setLocationId} />;
  else if (view === 'Stock count') page = <StockCountPage api={api} activeLocationId={locationId} onLocationChange={setLocationId} />;
  else if (view === 'Reports') page = <ReportsPage api={api} filter={{ locationId, date: businessDate, locations }} onFilterChange={(next) => { setLocationId(next.locationId); setBusinessDate(next.date); }} />;
  else if (view === 'Import') page = <ImportPage api={api} onComplete={() => setView('Settings')} onBack={() => setView('Settings')} />;
  else if (view === 'Settings') page = <SettingsPage api={api} onNavigate={setView} />;
  else page = <DashboardPage api={api} onNavigate={setView} filter={{ locationId, date: businessDate, locations }} onFilterChange={(next) => { setLocationId(next.locationId); setBusinessDate(next.date); }} />;
  return <AppShell page={view} onNavigate={setView} locations={locations} locationId={locationId} date={businessDate} onLocationChange={setLocationId} onDateChange={setBusinessDate}>{page}</AppShell>;
}
