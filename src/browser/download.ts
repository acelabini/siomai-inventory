export type BrowserPickedFile = Pick<File, 'name' | 'size' | 'text'>;
export type PickBrowserFile = (accept: string) => Promise<BrowserPickedFile | null>;
export type DownloadBrowserFile = (blob: Blob, fileName: string) => Promise<void>;

export const pickBrowserFile: PickBrowserFile = (accept) => new Promise((resolve, reject) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.hidden = true;
  const finish = (file: File | null) => { input.remove(); resolve(file); };
  input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
  input.addEventListener('cancel', () => finish(null), { once: true });
  document.body.append(input);
  try { input.click(); } catch (cause) { input.remove(); reject(cause); }
});

export const downloadBrowserFile: DownloadBrowserFile = async (blob, fileName) => {
  const file = new File([blob], fileName, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: fileName }); return; }
    catch (cause) {
      if (typeof cause === 'object' && cause !== null && 'name' in cause && cause.name === 'AbortError') throw new Error('File export canceled.');
      // A browser may advertise file sharing but reject it once user activation expires.
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
};
