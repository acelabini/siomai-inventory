# Release acceptance checklist

Release tag: __________  Version: __________  DMG SHA-256: __________

The desktop sections must be completed on macOS 13 or later by the client or release maintainer with the client-owned Developer ID and notarization credentials. The Windows/WSL development run cannot sign, notarize, staple, assess Gatekeeper, or install a macOS DMG. Do not mark the client installer ready until those checks have evidence attached to the release. The independent mobile web release uses the separate checklist below and requires no Apple subscription.

## Mobile web release — production HTTPS and physical iPhone

Release/version: __________  HTTPS URL/path: __________  Device/iOS: __________

Automated evidence is Chromium with an iPhone 14 viewport, not a claim of Safari hardware certification. The 2026-10-07 desktop evidence below predates the mobile layout; its 760px icon-rail description is historical. Current <=760px acceptance requires the bottom rail and More sheet.

- [ ] `npm test` has no new failures; record the two known Windows SQLite restore baseline failures separately by name if present. Browser/unit/renderer coverage, typecheck, and lint pass.
- [ ] `npm run build:web`, `npm run package`, and `npm run check:package` pass. `dist/web` contains the manifest, worker/runtime, icons, HTML, CSS, and JS assets.
- [ ] `npm run test:e2e:web` passes against its own production build/server. Evidence includes setup, opening 100 pieces, setting price, sale of 2 pieces, receipt/history after reload, all More destinations, manifest, activated controlling worker, and a new offline page with the server stopped showing ₱50 sales and 98 pieces remaining.
- [ ] The existing `npm run test:e2e` packaged Electron path is verified on its supported release host.
- [ ] Publish the complete `dist/web` output on static HTTPS. Verify the actual root/subdirectory path, correct content types, worker scope, revalidation for HTML/worker/manifest, and matching hashed assets. No server-side application or database is deployed.
- [ ] In normal iPhone Safari, load the hosted URL online completely and use Share → Add to Home Screen. Launch from its icon in a standalone window without an Apple Developer subscription.
- [ ] Confirm the operator understands that this phone has independent data with no Mac/phone sync, and knows which device is the working ledger.
- [ ] Complete setup, prices, opening stock, piece/pack sales, replenishment, transfer, count with discrepancy reason, reports, and sale void. Confirm stock and peso totals and Manila dates.
- [ ] Verify Overview/New sale/Inventory/More, all eight More destinations, usable 44px touch targets, readable record cards, focus/dismissal behavior, and content clear of the phone's safe areas and Home indicator.
- [ ] Close the app, enable airplane mode, reopen the Home Screen icon, and verify shell, stock, sales history/receipt, and a newly recorded offline operation persist through another reopening. First-ever offline installation is not supported.
- [ ] Import a CSV from Files, preview validation, and commit valid data. Export a CSV and inspect the saved file. Check browser print if the operator uses it.
- [ ] Create a manual JSON backup, confirm it exists in Files and in separate protected storage, and agree on end-of-day/before-update backup cadence. No automatic external backup is promised.
- [ ] Export current data, restore a known-good JSON backup, confirm replacement and page reload, and check business/location/stock/sales. Reject invalid or incompatible input without losing current records. Explain that desktop SQLite backups use a different format.
- [ ] Check the installation/storage guidance on Safari; if persistence is denied/unavailable, the warning points to backups and the operator understands it.
- [ ] With existing ledger data, deploy a compatible update, load online, close all app windows/tabs, and reopen to activate it. Verify records survive and offline reopening still works. Do not clear website storage to update.

Tested by/date: __________  Evidence and unresolved items: __________________

### Current automated mobile evidence — 2026-10-15 (Windows, Node 22.23.3)

- Browser/unit/renderer/PWA/package-check subset: **235 passed in 27 files**. Full suite: **317 passed, 2 failed in 39 files**. The only failures are the existing `BackupService` cases `takes a pre-restore safety backup and restores the selected backup atomically` and `restores committed content from a SQLite backup whose changes are still in its WAL` in `tests/integration/backup-service.test.ts`, both raising `BackupError` on Windows. The browser ledger tests pass.
- Typecheck and lint pass. The production web build passes and precaches 12 app assets. Existing Zod comment-annotation and >500 kB bundle advisories remain.
- `npm run test:e2e:web` passes its production journey, including a service-worker-served new page while offline and after the isolated preview server is stopped. Assertions cover ₱50.00 sales, 2 pieces sold, 98 remaining, persisted location, and valid activity dates. Screenshots are local artifacts under `out/e2e-web-results`.
- Windows packaging and `npm run check:package` pass; the checker inspects 76 ASAR entries. Its regression exercises a real archive and subprocess, including native path separators. macOS metadata/signing/device checks are still required on the corresponding platform.
- `npm run test:e2e` passes all **4 packaged Electron tests**: startup/network isolation, full business workflow and restart/void/backup, responsive pages at 1280/980/760px, keyboard navigation, and destructive-dialog cancellation. Its isolated launch uses `--user-data-dir`; narrow-screen assertions cover the mobile rail/More sheet and card tables.

Physical iPhone Safari, deployed HTTPS, Add to Home Screen, hardware safe areas/VoiceOver, Files downloads/restore, and a real hosted update have not been certified by this Windows automation. Keep those device checklist items unchecked until evidence is recorded.

## Current development evidence — 2026-10-07 (WSL Ubuntu 22.04)

- `npm ci` completed from the committed lockfile. With Node 22.13.1 selected, literal `npm test` passed: 26 files / 195 tests. The test script runs Vitest through Electron's embedded Node runtime, which is compatible with the shipped `better-sqlite3@13.0.3` Node-API 10 binary. Direct Node 22.13.1 construction still SIGSEGVs because that runtime reports Node-API 9; this is a runtime compatibility distinction, not a skipped test. The original seven crashing integration files all pass.
- `npm test -- tests/renderer` passed: 11 files / 98 tests. `npm run typecheck` and `npm run lint` passed.
- `npm run test:e2e` passed: 4 tests launching the actual packaged Linux Electron executable with isolated temporary user-data directories. The path includes setup, catalog, piece and pack sales, transfer, count, CSV export, restart, void reversal, and backup.
- `npm run package` passed; `npm run check:package` passed against 130 ASAR entries, including the SQLite JavaScript runtime and unpacked native binary. `Info.plist`, macOS bundle ID/deployment target, installed app icon, code signing, notarization, stapling, Gatekeeper, and Intel/Apple Silicon installation checks are unavailable here. The matching macOS checklist items below remain mandatory and unchecked.
- `npm run make:mac` and the signed/notarized DMG workflow have not run here. Client Apple Developer secrets are required by the tag workflow.

### Redesign acceptance — packaged Linux Electron build

- [x] At 1280px, Overview, New sale, Inventory, Reports, Products, Settings, and Import data show their page heading and primary action; the full navigation rail is visible. Setup was captured before first-run completion.
- [x] At 980px, the same seven pages remain operable with an icon rail, stacked sale summary, and no document overflow. Overview, New sale, Inventory, and Reports were captured.
- [x] At 760px, the same seven pages remain operable with a compact icon rail, stacked sale summary, keyboard-reachable Inventory table scrolling, and `document.documentElement.scrollWidth === document.documentElement.clientWidth`. Overview, New sale, Inventory, and Reports were captured.
- [x] Long business, location, product, and generated backup names retain their full accessible value or title without causing document overflow.
- [x] Tab and Shift+Tab reach the global navigation and Products primary action. A destructive archive dialog traps Tab focus, Escape cancels, focus returns to Archive, and the product remains active.
- [x] Status text includes explicit Completed/Voided receipt labels and healthy/low-stock labels; the existing sale and count path verifies successful status feedback.
- [x] Print media hides the shared rail and top bar while keeping Reports visible; the report Print action is covered by renderer tests. Reduced-motion media collapses control transitions.
- [x] The packaged executable loaded its first window with remote host resolution denied and an unreachable proxy configured from process launch. Renderer reload and exercised pages made only local `file:` requests. The Chromium startup netlog recorded attempted Hunspell dictionary requests to `redirector.gvt1.com`; these were blocked, and no other remote URLs were observed. Thus the app's renderer/runtime assets work offline, but “zero HTTP(S) attempts by Chromium” is not claimed. The package checker also rejects remote or unsafe CSP directives and development URLs.

Screenshots: `out/e2e-screenshots/` (16 PNGs: Setup and all seven pages at 1280px; Overview, New sale, Inventory, and Reports at both 980px and 760px). They are local test artifacts and are not release assets.

Intentional responsive choices: the 760px view keeps a 64px icon rail with accessible button names and tooltips; wide tables scroll inside focusable labeled regions. No dark host theme was implemented in this design, so light/dark appearance comparison is not applicable. No raster mock was stored in the repository; visual review used the approved design spec's hierarchy, spacing, palette, navigation, summaries, and status requirements.

## Automated build evidence

- [x] `npm ci` completed from the committed lockfile on WSL/Node 22.13.1; repeat on release macOS.
- [x] `npm test`, `npm run typecheck`, `npm run lint`, and `npm run test:e2e` passed on WSL/Node 22.13.1; repeat on release macOS.
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
