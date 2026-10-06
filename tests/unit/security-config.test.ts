import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { createWindowOptions } from '../../src/main';

describe('Electron window security configuration', () => {
  it('isolates renderer execution and points at the supplied preload bundle', () => {
    const options = createWindowOptions('/app/preload.js');

    expect(options.webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: '/app/preload.js',
    });
  });

  it('limits renderer content policy to local application assets', () => {
    const html = readFileSync(
      fileURLToPath(new URL('../../src/renderer/index.html', import.meta.url)),
      'utf8',
    );
    const document = new JSDOM(html).window.document;
    const policy = document
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute('content');

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toMatch(/https?:|unsafe-inline|unsafe-eval/i);
  });
});
