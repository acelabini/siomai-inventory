import { useEffect, useRef, useState } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import { getInventoryApi } from '../api';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Field from '../components/ui/Field';
import InlineNotice from '../components/ui/InlineNotice';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';

type SelectedBackup = { token: string; fileName: string };

export default function SettingsPage({ api = getInventoryApi(), onNavigate }: { api?: InventoryApi; onNavigate: (page: string) => void }) {
  const [businessName, setBusinessName] = useState('');
  const [backupDirectory, setBackupDirectory] = useState('');
  const [selectedBackup, setSelectedBackup] = useState<SelectedBackup | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [startupWarning, setStartupWarning] = useState('');
  const [lastBackupFile, setLastBackupFile] = useState('');
  const restoreTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    void api.getSettings().then((settings) => {
      if (!active) return;
      setBusinessName(settings.businessName);
      setBackupDirectory(settings.backupDirectory);
      setStartupWarning(settings.startupWarning ?? '');
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
      setLastBackupFile(backup.fileName);
      setMessage('Manual backup created.');
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
      const restored = await api.restoreBackup(selectedBackup.token);
      if (restored) await api.requestRelaunch();
      else { setSelectedBackup(null); setMessage('Restore canceled.'); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The backup could not be restored.'); }
    finally { setBusy(false); }
  }

  return <main className="catalog-page redesigned-catalog-page settings-page" aria-labelledby="settings-title">
    <PageHeader eyebrow="Business setup" title="Settings" titleId="settings-title" description="Manage your business profile, local backups, and imported records." />
    {error && <InlineNotice tone="danger" title="Settings action failed">{error}</InlineNotice>}
    {startupWarning && <InlineNotice tone="warning" role="alert" title="Startup backup needs attention" action={<Button variant="secondary" disabled={busy} onClick={() => void createManualBackup()}>Create backup now</Button>}>{startupWarning}<span className="startup-recovery-copy">Create a manual backup to protect current data.</span></InlineNotice>}
    {message && <InlineNotice tone="success" title={message} />}
    <div className="settings-sections">
      <Panel title="Business profile" className="settings-section" >
        <Field label="Business name" htmlFor="business-name" hint="This name appears in your local business records."><input id="business-name" value={businessName} maxLength={120} onChange={(event) => setBusinessName(event.target.value)} /></Field>
        <p className="settings-support-copy">Currency: PHP (₱). Time zone: Asia/Manila.</p>
        <div className="form-actions"><Button variant="primary" disabled={busy || !businessName.trim()} busy={busy} onClick={() => void saveBusinessName()}>Save settings</Button></div>
      </Panel>
      <Panel title="Backups" className="settings-section">
        <p>Automatic backups are stored once per Manila calendar day and the latest 30 are kept.</p>
        <div className="backup-directory-row"><div className="backup-directory-copy"><span className="settings-label">Backup directory</span><span className="backup-directory-value" title={backupDirectory}>{backupDirectory || 'Loading backup directory…'}</span></div><Button variant="secondary" onClick={() => void chooseDirectory()}>Choose backup directory</Button></div>
        <div className="settings-actions"><Button variant="primary" disabled={busy} busy={busy} onClick={() => void createManualBackup()}>{busy ? 'Creating backup…' : 'Create manual backup'}</Button></div>
        <p className="last-backup-status" role="status">{lastBackupFile ? <>Last successful backup: <span title={lastBackupFile}>{lastBackupFile}</span></> : 'No manual backup created this session.'}</p>
      </Panel>
      <Panel title="Restore" className="settings-section settings-restore-section">
        <p>Restore a local backup if you need to recover earlier business data. A safety backup is created first.</p>
        <Button variant="danger" icon="archive" disabled={busy} onClick={(event) => { restoreTriggerRef.current = event.currentTarget; event.currentTarget.focus(); void chooseBackup(); }}>Restore from backup</Button>
      </Panel>
      <Panel title="Import data" className="settings-section">
        <p>Bring products, opening stock, or supported spreadsheet records into this business.</p>
        <Button variant="secondary" icon="import" onClick={() => onNavigate('Import')}>Open import data</Button>
      </Panel>
      <Panel title="About" className="settings-section">
        <p>Siomai Inventory keeps this ledger and its backup files on this device.</p>
        <p className="settings-support-copy">Offline desktop inventory · PHP (₱) · Asia/Manila</p>
      </Panel>
    </div>
    <ConfirmDialog open={Boolean(selectedBackup)} title={`Restore ${selectedBackup?.fileName ?? 'backup'}?`} description="Current data will be protected with a safety backup before the selected database is restored." confirmLabel={busy ? 'Restoring…' : 'Restore backup'} busy={busy} onConfirm={() => void restore()} onCancel={() => { setSelectedBackup(null); setError(''); }}>
      {selectedBackup && <p className="restore-filename" title={selectedBackup.fileName}>{selectedBackup.fileName}</p>}
    </ConfirmDialog>
  </main>;
}
