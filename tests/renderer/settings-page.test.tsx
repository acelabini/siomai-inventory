// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventoryApi } from '../../src/shared/contracts';
import SettingsPage from '../../src/renderer/pages/SettingsPage';

afterEach(cleanup);

function settingsApi(overrides: Partial<InventoryApi> = {}): InventoryApi {
  return {
    getSettings: vi.fn().mockResolvedValue({ businessName: 'Cart ni Ate', backupDirectory: '/backups' }),
    saveSettings: vi.fn().mockResolvedValue({ businessName: 'Cart ni Ate' }),
    chooseBackupDirectory: vi.fn().mockResolvedValue('/new-backups'),
    createManualBackup: vi.fn().mockResolvedValue({ fileName: 'manual-2026-10-08.sqlite' }),
    chooseBackupFile: vi.fn().mockResolvedValue({ token: 'restore-token-1', fileName: 'cart.sqlite' }),
    restoreBackup: vi.fn().mockResolvedValue(true),
    requestRelaunch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as InventoryApi;
}

describe('SettingsPage', () => {
  it('describes web manual exports, storage durability and reload recovery truthfully', async () => {
    render(<SettingsPage api={settingsApi({ getSettings: vi.fn().mockResolvedValue({ businessName: 'Cart', backupDirectory: '', runtime: 'web', automaticBackups: false, storagePersistent: false }) })} onNavigate={vi.fn()} />);
    expect(await screen.findByText(/export manual backups/i)).toBeInTheDocument();
    expect(screen.queryByText(/automatic backups are stored/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /choose backup directory/i })).not.toBeInTheDocument();
    expect(screen.getByText(/persistent storage.*not.*granted/i)).toBeInTheDocument();
    expect(screen.queryByText(/safety backup is created first/i)).not.toBeInTheDocument();
    expect(screen.getByText(/offline web inventory/i)).toBeInTheDocument();
  });
  it('edits the business name and displays fixed currency and timezone settings', async () => {
    const saveSettings = vi.fn().mockResolvedValue({ businessName: 'Cart ni Bunso' });
    render(<SettingsPage api={settingsApi({ saveSettings })} onNavigate={vi.fn()} />);
    const businessName = await screen.findByLabelText(/business name/i);
    expect(businessName).toHaveValue('Cart ni Ate');
    expect(screen.getAllByText(/PHP.*Asia\/Manila|Asia\/Manila.*PHP/i).length).toBeGreaterThan(0);
    fireEvent.change(businessName, { target: { value: '  Cart ni Bunso  ' } });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith({ businessName: 'Cart ni Bunso' }));
  });

  it('surfaces a startup backup failure with a manual recovery action', async () => {
    render(<SettingsPage api={settingsApi({ getSettings: vi.fn().mockResolvedValue({ businessName: 'Cart', backupDirectory: '/backups', startupWarning: 'Automatic startup backup failed.' }) })} onNavigate={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/automatic startup backup failed/i);
    expect(screen.getByRole('button', { name: /create backup now/i })).toBeEnabled();
  });

  it('organizes the five settings sections and reports the backup destination', async () => {
    render(<SettingsPage api={settingsApi()} onNavigate={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Business profile' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Backups' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Import data' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'About' })).toBeInTheDocument();
    expect(screen.getByText('/backups')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import data/i })).toBeInTheDocument();
  });

  it('lets the operator choose a backup directory and create a manual backup', async () => {
    const services = settingsApi();
    render(<SettingsPage api={services} onNavigate={vi.fn()} />);
    await screen.findByText('/backups');
    fireEvent.click(screen.getByRole('button', { name: /choose backup directory/i }));
    await screen.findByText('/new-backups');
    fireEvent.click(screen.getByRole('button', { name: /create manual backup/i }));
    expect(await screen.findByText(/manual-2026-10-08\.sqlite/i)).toBeInTheDocument();
    expect(screen.getByText(/last successful backup/i)).toBeInTheDocument();
    expect(services.chooseBackupDirectory).toHaveBeenCalledOnce();
    expect(services.createManualBackup).toHaveBeenCalledOnce();
  });

  it('names the selected backup in the restore confirmation, restores it, and requests relaunch', async () => {
    const services = settingsApi();
    render(<SettingsPage api={services} onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /restore from backup/i }));
    expect(await screen.findByRole('dialog', { name: /restore cart\.sqlite/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^restore backup$/i }));
    await waitFor(() => expect(services.restoreBackup).toHaveBeenCalledWith('restore-token-1'));
    expect(services.requestRelaunch).toHaveBeenCalledOnce();
  });

  it('does nothing when the backup picker or restore confirmation is canceled', async () => {
    const services = settingsApi({ chooseBackupFile: vi.fn().mockResolvedValue(null) });
    render(<SettingsPage api={services} onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /restore from backup/i }));
    expect(services.restoreBackup).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not restore or relaunch when the operator cancels the confirmation', async () => {
    const services = settingsApi();
    render(<SettingsPage api={services} onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /restore from backup/i }));
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(services.restoreBackup).not.toHaveBeenCalled();
    expect(services.requestRelaunch).not.toHaveBeenCalled();
  });

  it('cancels restore with Escape and restores focus to the restore action', async () => {
    const services = settingsApi();
    render(<SettingsPage api={services} onNavigate={vi.fn()} />);
    const trigger = await screen.findByRole('button', { name: /restore from backup/i });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    expect(screen.getByRole('button', { name: /^cancel$/i })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(services.restoreBackup).not.toHaveBeenCalled();
    expect(dialog).not.toBeInTheDocument();
  });

  it('keeps a long backup filename accessible inside the restore dialog', async () => {
    const fileName = `${'very-long-backup-name-'.repeat(8)}2026-10-08.sqlite`;
    const services = settingsApi({ chooseBackupFile: vi.fn().mockResolvedValue({ token: 'restore-token-long', fileName }) });
    render(<SettingsPage api={services} onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /restore from backup/i }));
    expect(await screen.findByRole('dialog', { name: new RegExp(fileName) })).toBeInTheDocument();
    expect(screen.getByText(fileName)).toHaveAttribute('title', fileName);
  });

  it('does not request relaunch when the main-process confirmation is denied', async () => {
    const services = settingsApi({ restoreBackup: vi.fn().mockResolvedValue(false) });
    render(<SettingsPage api={services} onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /restore from backup/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^restore backup$/i }));
    await waitFor(() => expect(services.restoreBackup).toHaveBeenCalledWith('restore-token-1'));
    expect(services.requestRelaunch).not.toHaveBeenCalled();
  });

  it('keeps restore failures visible in the dialog and allows retry or cancellation', async () => {
    const restoreBackup = vi.fn().mockRejectedValueOnce(new Error('This backup is not compatible with this version.')).mockResolvedValue(true);
    const services = settingsApi({ restoreBackup });
    render(<SettingsPage api={services} onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /restore from backup/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^restore backup$/i }));
    const failure = await within(dialog).findByRole('alert');
    expect(failure).toHaveTextContent(/not compatible/i);
    expect(failure).toHaveTextContent(/you can retry the restore or cancel/i);
    expect(within(dialog).getByRole('button', { name: /^restore backup$/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /^restore backup$/i }));
    await waitFor(() => expect(services.requestRelaunch).toHaveBeenCalledOnce());
    expect(restoreBackup).toHaveBeenCalledTimes(2);
  });
});
