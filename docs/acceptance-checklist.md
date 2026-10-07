# Release acceptance checklist

Release tag: __________  Version: __________  DMG SHA-256: __________

This checklist must be completed on macOS 13 or later by the client or release maintainer with the client-owned Developer ID and notarization credentials. The Windows/WSL development run cannot sign, notarize, staple, assess Gatekeeper, or install a macOS DMG. Do not mark the client installer ready until all platform checks below have evidence attached to the release.

## Current development evidence — 2026-10-07 (WSL Ubuntu 22.04)

- `npm test` did not pass in this WSL run: 19 files / 125 tests passed, and seven native SQLite integration workers (`backup-service`, `catalog-service`, `import-service`, `inventory-service`, `migrations`, `report-service`, `sales-service`) exited with SIGSEGV before their tests ran. The crash reproduces with `npm test -- tests/integration/migrations.test.ts` and a direct Node `better-sqlite3` in-memory database construction. `npm rebuild better-sqlite3 --build-from-source` and a local `node-gyp rebuild --release --force_build=1` did not remove the crash. This is an unresolved native-addon verification blocker, not a test pass.
- `npm test -- tests/renderer` passed: 11 files / 98 tests. `npm run typecheck` and `npm run lint` passed.
- `npm run test:e2e` passed: 3 tests against the packaged Linux Electron app with isolated temporary user-data directories. The path includes setup, catalog, piece and pack sales, transfer, count, CSV export, restart, void reversal, and backup.
- `npm run package` passed; `node scripts/check-package.mjs` passed against 11 actual ASAR entries. `Info.plist`, macOS bundle ID/deployment target, installed app icon, code signing, notarization, stapling, Gatekeeper, and Intel/Apple Silicon installation checks are unavailable here. The matching macOS checklist items below remain mandatory and unchecked.
- `npm run make:mac` and the signed/notarized DMG workflow have not run here. Client Apple Developer secrets are required by the tag workflow.

### Redesign acceptance — packaged Linux Electron build

- [x] At 1280px, Overview, New sale, Inventory, Reports, Products, Settings, and Import data show their page heading and primary action; the full navigation rail is visible. Setup was captured before first-run completion.
- [x] At 980px, the same seven pages remain operable with an icon rail, stacked sale summary, and no document overflow. Overview, New sale, Inventory, and Reports were captured.
- [x] At 760px, the same seven pages remain operable with a compact icon rail, stacked sale summary, keyboard-reachable Inventory table scrolling, and `document.documentElement.scrollWidth === document.documentElement.clientWidth`. Overview, New sale, Inventory, and Reports were captured.
- [x] Long business, location, product, and generated backup names retain their full accessible value or title without causing document overflow.
- [x] Tab and Shift+Tab reach the global navigation and Products primary action. A destructive archive dialog traps Tab focus, Escape cancels, focus returns to Archive, and the product remains active.
- [x] Status text includes explicit Completed/Voided receipt labels and healthy/low-stock labels; the existing sale and count path verifies successful status feedback.
- [x] Print media hides the shared rail and top bar while keeping Reports visible; the report Print action is covered by renderer tests. Reduced-motion media collapses control transitions.
- [x] No HTTP(S) requests occurred during the exercised offline pages. The package checker also rejects remote or unsafe CSP directives and development URLs.

Screenshots: `out/e2e-screenshots/` (16 PNGs: Setup and all seven pages at 1280px; Overview, New sale, Inventory, and Reports at both 980px and 760px). They are local test artifacts and are not release assets.

Intentional responsive choices: the 760px view keeps a 64px icon rail with accessible button names and tooltips; wide tables scroll inside focusable labeled regions. No dark host theme was implemented in this design, so light/dark appearance comparison is not applicable. No raster mock was stored in the repository; visual review used the approved design spec's hierarchy, spacing, palette, navigation, summaries, and status requirements.

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
