# Release acceptance checklist

Release tag: __________  Version: __________  DMG SHA-256: __________

This checklist must be completed on macOS 13 or later by the client or release maintainer with the client-owned Developer ID and notarization credentials. The Windows/WSL development run cannot sign, notarize, staple, assess Gatekeeper, or install a macOS DMG. Do not mark the client installer ready until all platform checks below have evidence attached to the release.

## Current development evidence — 2026-10-07 (WSL Ubuntu 22.04)

- Unit, integration, and renderer verification passed: 20 files, 124 tests; typecheck and lint passed.
- Electron E2E passed on the Linux development package with an isolated temporary user-data directory.
- The Linux package checker passed against 11 actual ASAR entries. `Info.plist`, macOS bundle ID/deployment target, installed app icon, code signing, notarization, stapling, Gatekeeper, and Intel/Apple Silicon installation checks are not available in this environment. The matching macOS checklist items below remain mandatory and unchecked.
- `npm run make:mac` and the signed/notarized DMG workflow have not run here. Client Apple Developer secrets are required by the tag workflow.

## Automated build evidence

- [ ] `npm ci` completed from the committed lockfile.
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, and `npm run test:e2e` passed.
- [ ] `npm run make:mac` produced one universal DMG from the Forge universal target.
- [ ] `node scripts/check-package.mjs` passed against the packaged app, including Info.plist bundle ID, macOS 13 minimum, valid installed ICNS icon, CSP, no development URL, and no signing credential.
- [ ] Release workflow attached the DMG and matching `.sha256` file.
- [ ] `shasum -a 256 -c <dmg>.sha256` passed after download.

## Signature, notarization, and architecture

- [ ] `codesign --verify --deep --strict --verbose=2 "Siomai Inventory.app"` passed.
- [ ] `spctl --assess --type execute --verbose=4 "Siomai Inventory.app"` accepted the app.
- [ ] `xcrun stapler validate "Siomai Inventory.app"` passed.
- [ ] `xcrun stapler validate "Siomai Inventory.dmg"` passed.
- [ ] `lipo -archs "Siomai Inventory.app/Contents/MacOS/Siomai Inventory"` contains both `x86_64` and `arm64`.
- [ ] DMG signing/notarization status and the notary submission ID are recorded with the release.

## Install and business acceptance

- [ ] On Apple Silicon, open the DMG and drag the app into Applications; Gatekeeper launches it without a workaround.
- [ ] On an Intel Mac, open the same universal DMG and confirm the app launches.
- [ ] Complete first-run setup, set a product price, open stock, record a piece sale and a pack sale, replenish stock, transfer stock, and record a count discrepancy with a reason.
- [ ] Confirm report totals, CSV export, sale void/reversal, and the manual backup.
- [ ] Quit and reopen; confirm balances and records persist.
- [ ] Install an upgrade over the existing app; confirm the Application Support database remains intact.
- [ ] Restore a known-good backup, confirm the pre-restore safety backup exists, and confirm the app relaunches with restored records.
- [ ] Confirm the app operates with networking disabled and no sign-in.

Tested by: __________  Date: __________  macOS versions/devices: __________

Evidence or notes: _______________________________________________________
