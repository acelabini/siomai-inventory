import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPackageWithOptions } from '@electron/asar';
import { expect, it } from 'vitest';

it('inspects nested renderer and runtime files in a real ASAR on the current platform', async () => {
  // npm test uses Electron's Node runtime; inspect the physical archive rather than its virtual directory.
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'siomai-package-check-'));
  const originalNoAsar = process.noAsar;
  process.noAsar = true;
  try {
    const source = path.join(temporary, 'app');
    const archive = path.join(temporary, 'app.asar');
    const files: Record<string, string> = {
      'package.json': JSON.stringify({ name: 'siomai-inventory', productName: 'Siomai Inventory', version: '1.0.0', main: '.vite/build/main.cjs' }),
      '.vite/build/main.cjs': 'module.exports = {};',
      '.vite/renderer/main_window/index.html': '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; object-src \'none\'; base-uri \'none\'">',
      'node_modules/better-sqlite3/lib/index.js': 'module.exports = {};',
      [`node_modules/better-sqlite3/prebuilds/${process.platform}-${process.arch}.node`]: 'fixture native binary',
    };
    for (const [relative, contents] of Object.entries(files)) {
      const destination = path.join(source, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, contents);
    }
    await createPackageWithOptions(source, archive, { unpack: '**/*.node' });
    const result = execFileSync(process.execPath, [path.resolve('scripts/check-package.mjs'), archive], {
      encoding: 'utf8', env: { ...process.env, ELECTRON_NO_ASAR: '1' }, stdio: 'pipe',
    });
    expect(result).toMatch(/PASS: checked \d+ packaged archive entries/);
  } finally {
    try { await rm(temporary, { recursive: true, force: true }); }
    finally { process.noAsar = originalNoAsar; }
  }
});
