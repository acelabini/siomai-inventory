import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/macos-release.yml', import.meta.url), 'utf8');
const forgeConfig = readFileSync(new URL('../forge.config.ts', import.meta.url), 'utf8');

describe('macOS release workflow', () => {
  it('imports the Developer ID certificate before any Forge packaging command', () => {
    const certificateImport = workflow.indexOf('Import Developer ID certificate into temporary keychain');
    const forgePackagingCommands = [...workflow.matchAll(/npm run (?:test:e2e|package|make:mac|make)\b/g)]
      .map((match) => match.index ?? Number.MAX_SAFE_INTEGER);

    expect(certificateImport).toBeGreaterThanOrEqual(0);
    expect(forgePackagingCommands.length).toBeGreaterThan(0);
    expect(certificateImport).toBeLessThan(Math.min(...forgePackagingCommands));
  });

  it('uses the macOS base64 decoder option when importing the Developer ID certificate', () => {
    const certificateImport = workflow.slice(
      workflow.indexOf('Import Developer ID certificate into temporary keychain'),
      workflow.indexOf('Run unit, integration, renderer, and type checks'),
    );

    expect(certificateImport).toContain('base64 -D');
    expect(certificateImport).not.toContain('--decode');
  });

  it('checks only the uniquely selected universal app produced for release', () => {
    const buildAndInspect = workflow.slice(
      workflow.indexOf('Build and inspect the universal app'),
      workflow.indexOf('Notarize and staple app, then build final DMG'),
    );

    expect(buildAndInspect).toContain("find out -type d -path '*/darwin-universal/Siomai Inventory.app'");
    expect(buildAndInspect).toContain('exactly one universal app');
    expect(buildAndInspect).toContain('node scripts/check-package.mjs "$APP_PATH"');
    expect(buildAndInspect).not.toMatch(/\bmapfile\b/);
  });

  it('submits and staples the app before creating, submitting, and stapling the exact final DMG', () => {
    const appAndDmgFlow = workflow.slice(
      workflow.indexOf('Notarize and staple app, then build final DMG'),
      workflow.indexOf('Upload notarized universal DMG and checksum'),
    );
    const appSubmit = appAndDmgFlow.indexOf('notarytool submit "$APP_NOTARY_ZIP"');
    const appAccepted = appAndDmgFlow.indexOf('if [[ "$APP_STATUS" != \'Accepted\' ]]');
    const appStaple = appAndDmgFlow.indexOf('stapler staple "$APP_PATH"');
    const appValidate = appAndDmgFlow.indexOf('stapler validate "$APP_PATH"');
    const finalDmgCreate = appAndDmgFlow.indexOf('hdiutil create');
    const finalDmgSign = appAndDmgFlow.indexOf('codesign --force --sign "$APPLE_SIGNING_IDENTITY" --timestamp "$FINAL_DMG"');
    const finalDmgSignatureVerify = appAndDmgFlow.indexOf('codesign --verify --strict --verbose=2 "$FINAL_DMG"');
    const dmgSubmit = appAndDmgFlow.indexOf('notarytool submit "$FINAL_DMG"');
    const dmgAccepted = appAndDmgFlow.indexOf('if [[ "$DMG_STATUS" != \'Accepted\' ]]');
    const dmgStaple = appAndDmgFlow.indexOf('stapler staple "$FINAL_DMG"');
    const finalSignatureCheck = appAndDmgFlow.indexOf('codesign --verify --strict --verbose=2 "$FINAL_DMG"', dmgStaple);
    const dmgValidate = appAndDmgFlow.indexOf('stapler validate "$FINAL_DMG"');

    expect(appSubmit).toBeGreaterThanOrEqual(0);
    expect(appSubmit).toBeLessThan(appAccepted);
    expect(appAccepted).toBeLessThan(appStaple);
    expect(appStaple).toBeLessThan(appValidate);
    expect(appValidate).toBeLessThan(finalDmgCreate);
    expect(finalDmgCreate).toBeLessThan(finalDmgSign);
    expect(finalDmgSign).toBeLessThan(finalDmgSignatureVerify);
    expect(finalDmgSignatureVerify).toBeLessThan(dmgSubmit);
    expect(dmgSubmit).toBeLessThan(dmgAccepted);
    expect(dmgAccepted).toBeLessThan(dmgStaple);
    expect(dmgStaple).toBeLessThan(dmgValidate);
    expect(finalSignatureCheck).toBeGreaterThan(dmgStaple);
    expect(finalSignatureCheck).toBeLessThan(dmgValidate);
    expect(appAndDmgFlow).toContain('Siomai-Inventory-${GITHUB_REF_NAME}-universal.dmg');
    expect(appAndDmgFlow).toContain('hdiutil create -volname \'Siomai Inventory\' -srcfolder "$DMG_STAGING_DIR" -ov -format UDZO "$FINAL_DMG"');
    expect(appAndDmgFlow).toContain('codesign --verify --deep --strict --verbose=2 "$APP_PATH"');
    expect(appAndDmgFlow).toContain('spctl --assess --type execute --verbose=4 "$APP_PATH"');
    expect(appAndDmgFlow).toContain('EXECUTABLE="$APP_PATH/Contents/MacOS/Siomai Inventory"');
    expect(appAndDmgFlow).toContain('DMG_NAME="$(basename "$FINAL_DMG")"');
    expect(appAndDmgFlow).toContain('dmg_path=$FINAL_DMG');
    expect(appAndDmgFlow).toContain('RELEASE_DMG_PATH=$FINAL_DMG');
  });

  it('leaves notarization ordering to the workflow instead of Forge hooks', () => {
    expect(forgeConfig).not.toContain('osxNotarize');
  });
});
