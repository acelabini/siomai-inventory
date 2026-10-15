// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBrowserFile, pickBrowserFile } from '../../src/browser/download';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); document.body.replaceChildren(); });
describe('native browser file adapters', () => {
  it('cleans up the CSV picker on cancellation and resolves with no file', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    const result = pickBrowserFile('.csv,text/csv');
    const input = document.querySelector('input')!;
    expect(input.accept).toBe('.csv,text/csv');
    input.dispatchEvent(new Event('cancel'));
    expect(await result).toBeNull();
    expect(document.querySelector('input')).toBeNull();
  });
  it('returns the selected file and removes the picker', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    const result = pickBrowserFile('.json,application/json');
    const input = document.querySelector('input')!;
    const file = new File(['{}'], 'backup.json');
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    expect(await result).toBe(file);
    expect(document.querySelector('input')).toBeNull();
  });
  it('downloads a named Blob and releases its temporary URL after the browser has opened it', async () => {
    vi.useFakeTimers();
    const saved: Array<{ fileName: string; href: string }> = [];
    const revoked: string[] = [];
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:export', revokeObjectURL: (url: string) => { revoked.push(url); } });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { saved.push({ fileName: this.download, href: this.href }); });
    await downloadBrowserFile(new Blob(['csv']), 'report.csv');
    expect(saved).toEqual([{ fileName: 'report.csv', href: 'blob:export' }]);
    expect(document.querySelector('a')).toBeNull();
    expect(revoked).toEqual([]);
    vi.advanceTimersByTime(60_000);
    expect(revoked).toEqual(['blob:export']);
  });
  it('uses supported file sharing and surfaces cancellation', async () => {
    const shared: File[] = [];
    vi.stubGlobal('navigator', { canShare: () => true, share: async ({ files }: { files: File[] }) => { shared.push(...files); } });
    await downloadBrowserFile(new Blob(['{}']), 'backup.json');
    expect(shared[0].name).toBe('backup.json');
    vi.stubGlobal('navigator', { canShare: () => true, share: async () => { throw new DOMException('Canceled', 'AbortError'); } });
    await expect(downloadBrowserFile(new Blob(['{}']), 'backup.json')).rejects.toThrow(/canceled/i);
  });
});
