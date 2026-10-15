import { useEffect, useState } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import Button from './ui/Button';

const dismissalKey = 'siomai-install-notice-dismissed';

export default function InstallNotice({ api, onNavigate }: { api: InventoryApi; onNavigate: (page: string) => void }) {
  const [settings, setSettings] = useState<Awaited<ReturnType<InventoryApi['getSettings']>> | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(dismissalKey) === 'true'; } catch { return false; }
  });

  useEffect(() => {
    let active = true;
    if (typeof api.getSettings === 'function') void api.getSettings().then((value) => {
      if (active) setSettings(value);
    }).catch(() => { /* Settings owns its load error and recovery actions. */ });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    const update = () => setInstalled(Boolean(displayMode?.matches || (navigator as Navigator & { standalone?: boolean }).standalone));
    const onInstalled = () => setInstalled(true);
    update();
    displayMode?.addEventListener('change', update);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      displayMode?.removeEventListener('change', update);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (settings?.runtime !== 'web') return null;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
  const showInstall = isIos && isSafari && !installed && !dismissed;
  const storageRisk = settings.storagePersistent !== true;
  if (!showInstall && !storageRisk) return null;

  function dismissInstall() {
    setDismissed(true);
    try { localStorage.setItem(dismissalKey, 'true'); } catch { /* Dismiss for this session when storage is unavailable. */ }
  }

  return <div className="web-guidance">
    {showInstall && <section className="web-notice" aria-labelledby="install-notice-title">
      <div><h2 id="install-notice-title">Install on your iPhone</h2>
        <p>In Safari, tap Share, then Add to Home Screen. You can also keep using this browser.</p>
        <p>Open online once and let the app finish loading before using it offline.</p></div>
      <Button variant="ghost" onClick={dismissInstall} aria-label="Dismiss install guidance">Dismiss</Button>
    </section>}
    {storageRisk && <section className="web-notice web-notice-warning" aria-labelledby="storage-notice-title">
      <div><h2 id="storage-notice-title">Protect this ledger</h2>
        <p>Persistent storage is unavailable or was not granted. This browser may remove your local data.</p>
        <p>Create a manual backup in Settings and save it to Files or another safe location. No automatic external backup is created.</p></div>
      <Button variant="secondary" onClick={() => onNavigate('Settings')}>Backup in Settings</Button>
    </section>}
  </div>;
}
