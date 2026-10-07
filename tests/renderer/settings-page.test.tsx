// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  it('edits the business name and displays fixed currency and timezone settings', async () => {
    const saveSettings = vi.fn().mockResolvedValue({ businessName: 'Cart ni Bunso' });
    render(<SettingsPage api={settingsApi({ saveSettings })} onNavigate={vi.fn()} />);
    const businessName = await screen.findByLabelText(/business name/i);
    expect(businessName).toHaveValue('Cart ni Ate');
    expect(screen.getByText(/PHP.*Asia\/Manila|Asia\/Manila.*PHP/i)).toBeInTheDocument();
    fireEvent.change(businessName, { target: { value: '  Cart ni Bunso  ' } });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith({ businessName: 'Cart ni Bunso' }));
  });

  it('surfaces a startup backup failure with a manual recovery action', async () => {
    render(<SettingsPage api={settingsApi({ getSettings: vi.fn().mockResolvedValue({ businessName: 'Cart', backupDirectory: '/backups', startupWarning: 'Automatic startup backup failed.' }) })} onNavigate={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/automatic startup backup failed/i);
    expect(screen.getByRole('button', { name: /create backup now/i })).toBeEnabled();
  });

  it('lets the operator choose a backup directory and create a manual backup', async () => {
    const services = settingsApi();
    render(<SettingsPage api={services} onNavigate={vi.fn()} />);
    await screen.findByText('/backups');
    fireEvent.click(screen.getByRole('button', { name: /choose backup directory/i }));
    await screen.findByText('/new-backups');
    fireEvent.click(screen.getByRole('button', { name: /create backup now/i }));
    expect(await screen.findByText(/manual-2026-10-08\.sqlite/i)).toBeInTheDocument();
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

  it('does not request relaunch when the main-process confirmation is denied', async () => {
    const services = settingsApi({ restoreBackup: vi.fn().mockResolvedValue(false) });
    render(<SettingsPage api={services} onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /restore from backup/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^restore backup$/i }));
    await waitFor(() => expect(services.restoreBackup).toHaveBeenCalledWith('restore-token-1'));
    expect(services.requestRelaunch).not.toHaveBeenCalled();
  });

  it('shows restore validation failures and does not request relaunch', async () => {
    const services = settingsApi({ restoreBackup: vi.fn().mockRejectedValue(new Error('This backup is not compatible with this version.')) });
    render(<SettingsPage api={services} onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /restore from backup/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^restore backup$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not compatible/i);
    expect(services.requestRelaunch).not.toHaveBeenCalled();
  });
});
