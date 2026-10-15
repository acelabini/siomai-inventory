// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryApi } from '../../src/shared/contracts';
import InstallNotice from '../../src/renderer/components/InstallNotice';

const iphoneSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
function api(storagePersistent: boolean | undefined = true, runtime = 'web') {
  return { getSettings: async () => ({ businessName: 'Cart', backupDirectory: '', runtime, automaticBackups: false, storagePersistent }) } as InventoryApi;
}
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(iphoneSafari);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('InstallNotice', () => {
  it('gives non-blocking Safari Share and Add to Home Screen instructions', async () => {
    render(<InstallNotice api={api()} onNavigate={vi.fn()} />);
    expect(await screen.findByRole('region', { name: /install/i })).toHaveTextContent(/Safari.*Share.*Add to Home Screen/i);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/installed successfully|ready.*offline/i)).not.toBeInTheDocument();
  });
  it('persists dismissal across subsequent mounts', async () => {
    const first = render(<InstallNotice api={api()} onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /dismiss install/i }));
    expect(screen.queryByRole('region', { name: /install/i })).not.toBeInTheDocument();
    first.unmount();
    render(<InstallNotice api={api(false)} onNavigate={vi.fn()} />);
    await screen.findByRole('region', { name: /protect/i });
    expect(screen.queryByRole('region', { name: /install/i })).not.toBeInTheDocument();
  });
  it.each(['display mode', 'iOS standalone'])('hides install guidance when installed via %s', async (mode) => {
    if (mode === 'display mode') vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    else Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    render(<InstallNotice api={api(false)} onNavigate={vi.fn()} />);
    await screen.findByRole('region', { name: /protect/i });
    expect(screen.queryByRole('region', { name: /install/i })).not.toBeInTheDocument();
    delete (navigator as Navigator & { standalone?: boolean }).standalone;
  });
  it.each(['Mozilla/5.0 Android Chrome/130', iphoneSafari.replace('Version/18.0', 'CriOS/130')])('does not show Safari instructions in a different browser', async (userAgent) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    render(<InstallNotice api={api(false)} onNavigate={vi.fn()} />);
    await screen.findByRole('region', { name: /protect/i });
    expect(screen.queryByRole('region', { name: /install/i })).not.toBeInTheDocument();
  });
  it('keeps a storage warning visible and takes the operator to Settings for manual backup', async () => {
    const navigate = vi.fn();
    render(<InstallNotice api={api(false)} onNavigate={navigate} />);
    const warning = await screen.findByRole('region', { name: /protect/i });
    expect(warning).toHaveTextContent(/browser may remove.*local data/i);
    expect(warning).toHaveTextContent(/manual backup.*Files/i);
    fireEvent.click(screen.getByRole('button', { name: /backup.*settings/i }));
    expect(navigate).toHaveBeenCalledWith('Settings');
    fireEvent.click(screen.getByRole('button', { name: /dismiss install/i }));
    expect(warning).toBeInTheDocument();
  });
  it('shows no storage risk notice when persistence was granted', async () => {
    render(<InstallNotice api={api()} onNavigate={vi.fn()} />);
    await screen.findByRole('region', { name: /install/i });
    expect(screen.queryByRole('region', { name: /protect/i })).not.toBeInTheDocument();
  });
  it('keeps Electron free of web installation and storage notices', async () => {
    render(<InstallNotice api={api(false, 'desktop')} onNavigate={vi.fn()} />);
    await Promise.resolve();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
