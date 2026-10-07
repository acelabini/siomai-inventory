import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/macos-release.yml', import.meta.url), 'utf8');

describe('macOS release workflow', () => {
  it('imports the Developer ID certificate before any Forge packaging command', () => {
    const certificateImport = workflow.indexOf('Import Developer ID certificate into temporary keychain');
    const forgePackagingCommands = [...workflow.matchAll(/npm run (?:test:e2e|package|make:mac|make)\b/g)]
      .map((match) => match.index ?? Number.MAX_SAFE_INTEGER);

    expect(certificateImport).toBeGreaterThanOrEqual(0);
    expect(forgePackagingCommands.length).toBeGreaterThan(0);
    expect(certificateImport).toBeLessThan(Math.min(...forgePackagingCommands));
  });

  it('checks only the uniquely selected universal app produced for release', () => {
    const buildAndInspect = workflow.slice(
      workflow.indexOf('Build the universal app and DMG'),
      workflow.indexOf('Notarize and staple app and disk image'),
    );

    expect(buildAndInspect).toContain("find out -type d -path '*/darwin-universal/Siomai Inventory.app'");
    expect(buildAndInspect).toContain('exactly one universal app');
    expect(buildAndInspect).toContain('node scripts/check-package.mjs "$APP_PATH"');
    expect(buildAndInspect).not.toMatch(/\bmapfile\b/);
  });
});
