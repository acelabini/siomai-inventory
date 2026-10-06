import { useEffect, useState } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import { getInventoryApi } from '../api';

type SelectedBackup = { filePath: string; fileName: string };

export default function SettingsPage({ api = getInventoryApi(), onNavigate }: { api?: InventoryApi; onNavigate: (page: string) => void }) {
  const [businessName, setBusinessName] = useState('');
  const [backupDirectory, setBackupDirectory] = useState('');
  const [selectedBackup, setSelectedBackup] = useState<SelectedBackup | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void api.getSettings().then((settings) => {
      if (!active) return;
      setBusinessName(settings.businessName);
      setBackupDirectory(settings.backupDirectory);
    }).catch(() => { if (active) setError('Settings could not be loaded.'); });
    return () => { active = false; };
  }, [api]);

  async function saveBusinessName() {
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await api.saveSettings({ businessName: businessName.trim() });
      setBusinessName(saved.businessName);
      setMessage('Business name saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Settings could not be saved.'); }
    finally { setBusy(false); }
  }

  async function chooseDirectory() {
    setError('');
    try {
      const selected = await api.chooseBackupDirectory();
      if (selected) setBackupDirectory(selected);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Backup directory could not be changed.'); }
  }

  async function createManualBackup() {
    setBusy(true); setError(''); setMessage('');
    try {
      const backup = await api.createManualBackup();
      setMessage(`Backup created: ${backup.fileName}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'A backup could not be created.'); }
    finally { setBusy(false); }
  }

  async function chooseBackup() {
    setError('');
    try {
      const selected = await api.chooseBackupFile();
      if (selected) setSelectedBackup(selected);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The backup file could not be opened.'); }
  }

  async function restore() {
    if (!selectedBackup) return;
    setBusy(true); setError('');
    try {
      await api.restoreBackup(selectedBackup.filePath);
      await api.requestRelaunch();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The backup could not be restored.'); }
    finally { setBusy(false); }
  }

  return <section className="catalog-page settings-page" aria-labelledby="settings-title">
    <div className="page-heading"><div><p className="eyebrow">Business setup</p><h1 id="settings-title">Settings</h1></div></div>
    {error && <p role="alert" className="field-error">{error}</p>}
    {message && <p role="status" className="report-note">{message}</p>}
    <section aria-labelledby="business-settings-title">
      <h2 id="business-settings-title">Business</h2>
      <label className="form-field" htmlFor="business-name">Business name<input id="business-name" value={businessName} maxLength={120} onChange={(event) => setBusinessName(event.target.value)} /></label>
      <p className="report-note">Currency: PHP (₱). Time zone: Asia/Manila.</p>
      <button className="primary-button" type="button" disabled={busy || !businessName.trim()} onClick={() => void saveBusinessName()}>Save settings</button>
    </section>
    <section aria-labelledby="backup-settings-title">
      <h2 id="backup-settings-title">Backups and recovery</h2>
      <p>Automatic backups are stored once per Manila calendar day and the latest 30 are kept.</p>
      <div className="form-actions"><span aria-label="Backup directory">{backupDirectory}</span><button className="secondary-button" type="button" onClick={() => void chooseDirectory()}>Choose backup directory</button></div>
      <button className="primary-button" type="button" disabled={busy} onClick={() => void createManualBackup()}>{busy ? 'Working…' : 'Create backup now'}</button>
      <div className="form-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => void chooseBackup()}>Restore from backup</button><button className="secondary-button" type="button" onClick={() => onNavigate('Import')}>Import CSV data</button></div>
    </section>
    {selectedBackup && <section className="confirmation-panel" role="dialog" aria-modal="true" aria-labelledby="restore-title">
      <h2 id="restore-title">Restore {selectedBackup.fileName}?</h2>
      <p>Current data will be protected with a safety backup before the selected database is restored.</p>
      <div className="form-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => { setSelectedBackup(null); setError(''); }}>Cancel</button><button className="primary-button" type="button" disabled={busy} onClick={() => void restore()}>{busy ? 'Restoring…' : 'Restore backup'}</button></div>
    </section>}
  </section>;
}
