# Build, release, and recovery

## Requirements and local development

- Node.js 22.13 or newer; the release runner uses Node.js 22.23.3.
- npm 10.9 or newer and a clean `npm ci` from the committed lockfile.
- For the desktop DMG only: macOS 13 or newer and Xcode command-line tools. A macOS machine with the client's Developer ID identity and notarization access is required for a distributable desktop release.

## Mobile web build and static HTTPS release

The web app has no backend, accounts, synchronization, or hosted database. It needs only a static HTTPS host. No Apple Developer Program subscription or signing/notarization credentials are needed for Safari's Add to Home Screen distribution. Desktop DMG signing requirements below apply only to the desktop release.

Build with `npm ci` followed by `npm run build:web`. Publish the **contents of `dist/web`** as one static directory, including `index.html`, `manifest.webmanifest`, `registerSW.js`, `sw.js`, the generated `workbox-*.js`, icons, and hashed `assets/`. Do not publish the repository, Electron package, or a development server. `npm run preview:web -- --host 127.0.0.1` serves this production output for local inspection; local HTTP loopback is a secure-context development exception, not the phone's deployment URL.

Use a stable HTTPS origin and installation path. Vite's relative base supports a dedicated root or subdirectory; keep all output together and test the actual installation path. Changing the origin creates a separate browser ledger. Configure the host to serve JavaScript, CSS, PNG, and web manifest files with their correct content types, and serve `sw.js` without redirecting it to HTML. The generated worker controls only its installation scope. Existing Content Security Policy must remain effective; no remote script, font, API, or CDN runtime is needed.

### Cache-safe releases and updates

1. Run the verification matrix below and retain a copy of the complete release output. Back up an acceptance ledger before upgrading it.
2. Deploy the complete output atomically. HTML and the worker must refer to the matching hashed assets. Retain prior hashed assets while old windows may still use them, where the hosting platform supports this.
3. Configure `index.html`, `sw.js`, `registerSW.js`, and `manifest.webmanifest` to revalidate (`Cache-Control: no-cache`); revalidate unversioned icons as well. Hashed assets may use long-lived immutable caching. Ensure intermediary/CDN caches honor these rules.
4. Open the stable HTTPS URL online. Wait for loading and worker installation. Finish any active forms, then close all app windows and Safari tabs for this app and reopen it. A waiting worker activates after the old clients close; an update never forcibly reloads an open sale. A further online close/reopen may be needed to discover and activate a release.
5. Confirm existing records survive, then close and reopen offline. The service worker caches app files only; business data stays in IndexedDB and is never sent to the host. Do not clear website data, unregister workers, or delete IndexedDB as an update procedure.

Database version 1 upgrades must remain forward-only. Future schema changes need migration and backup compatibility tests before release. Rolling back static assets does not roll back device data: do not deploy an older client that cannot read a newer schema. If a release fails acceptance, keep the previous compatible static release available and preserve backups before recovery.

### Automated web verification

Install the matching test browser with `npx playwright install chromium` after dependency installation (Linux CI may need `npx playwright install --with-deps chromium`). Run `npm run test:e2e:web`. The command builds this checkout's `dist/web` and runs only the `mobile-web` Playwright project. Its fixture starts Vite's production preview on `127.0.0.1` with an OS-allocated port and never reuses existing servers. It creates an isolated temporary persistent Chromium profile with iPhone 14 emulation, uses real IndexedDB and UI actions, checks saved receipts and install metadata, waits for an activated controlling worker, closes the page, stops the server, verifies the origin is unreachable, and opens a new offline page in the same profile. Server, browser, and temporary profile are cleaned up on success or failure. Results are under `out/e2e-web-results`.

`npm run test:e2e` retains the existing packaged Electron journey and runs only `app.spec.ts`; it does not use the web server or browser fixture. The shared Playwright configuration separates these projects. Do not use a developer's running server to establish release evidence.

Before release run:

```sh
npm test
npm run typecheck
npm run lint
npm run build:web
npm run package
npm run check:package
npm run test:e2e:web
npm run test:e2e
```

Record full-suite failures individually. On the current Windows host, the existing SQLite backup integration cases for atomic restore and WAL-backed restore fail with `BackupError`; these are desktop baseline failures and must not hide any new browser or renderer failures. Repeat desktop validation on the release platform. Chromium iPhone emulation verifies the automated contract, but actual iPhone Safari installation, safe areas, downloads, restore, and updates require the separate device acceptance checklist.

### Phone recovery

The operator must export JSON backups manually at closing and before updates/restores, and retain copies outside the phone. Browser storage persistence is requested where supported but is not a backup guarantee. A lost phone, cleared website storage, or browser eviction requires a saved JSON backup. On the same or replacement phone, load the HTTPS app online, complete initial setup if prompted, then use Settings to select and confirm a compatible JSON backup. Verify restored business, stock, and sales after the reload. Restore replaces the ledger atomically; rejected input leaves current records untouched. Export current data first because the transient in-memory safety snapshot is not a durable recovery file. Desktop SQLite backups are not accepted by the web app, and web backups do not restore into the desktop app.

## Desktop development and packaging

Run `npm start` for development. Run unit/integration/component tests with `npm test`, plus `npm run typecheck` and `npm run lint`. `npm run test:e2e` packages the local Electron app, launches it with a new temporary user-data folder, completes setup and stock/report workflows, relaunches it, checks persistence and voiding, and creates a manual backup. `npm run package` builds the current platform's app without producing a signed installer. Run `node scripts/check-package.mjs` after packaging to inspect the actual ASAR archive.

The app stores its SQLite database outside the app bundle in Application Support, so replacing the app for a manual update does not replace business data. Forge builds the macOS universal target with `npm run make:mac`, which invokes `electron-forge make --platform=darwin --arch=universal`; Electron Forge packages both architectures and merges them into one universal app. The `better-sqlite3` native module stays external to the Vite main bundle so Forge can rebuild and package its native binaries.

## Signing identity and GitHub Actions secrets

The business owner supplies and controls the Apple Developer identity. Add these repository Actions secrets before pushing a release tag:

| Secret | Use |
| --- | --- |
| `APPLE_CERTIFICATE_P12_BASE64` | Base64-encoded Developer ID Application certificate and private key in PKCS#12 format |
| `APPLE_CERTIFICATE_PASSWORD` | Password for that PKCS#12 file |
| `APPLE_SIGNING_IDENTITY` | Exact Developer ID Application identity name, for example `Developer ID Application: Example Company (ABCDE12345)` |
| `APPLE_ID` | Apple Account email authorized for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for `notarytool` |
| `APPLE_TEAM_ID` | 10-character Apple Developer Team ID |

The workflow stops with a missing-secret error before packaging if any value is absent. The certificate is imported into an ephemeral runner keychain. Signing and notarization credentials are exposed only through the process environment to the Forge signing or release notarization steps; they are not stored in source, the app bundle, the DMG, or the release artifact. Do not enable shell tracing around credential setup.

Push a tag such as `v1.0.0` to run `.github/workflows/macos-release.yml`. It installs locked dependencies, runs tests, typecheck, lint, and E2E, builds and checks the universal app, signs with hardened runtime and the app entitlements, submits a ZIP of the app and waits for an `Accepted` notarization result, then staples and validates the app. It recreates the final DMG from that stapled app, submits the exact final DMG and waits for acceptance, staples and validates it, checks the app signature/Gatekeeper assessment and both executable architectures, generates a SHA-256 file, and uploads the final DMG and checksum as a workflow artifact.

Forge's configuration accepts `APPLE_SIGNING_IDENTITY` from the environment for code signing. The release workflow uses `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` directly with `notarytool`; notarization is intentionally sequenced outside Forge so the final DMG is built from the already-stapled app. Local unsigned packages are suitable for development only. Never commit a certificate, private key, app-specific password, or local keychain export.

## Release recovery

1. If dependency installation or a pre-release check fails, use the workflow log to identify the failing command; do not publish an artifact from a failed run.
2. If signing fails, confirm the certificate is a valid Developer ID Application certificate, that its private key is in the P12, that the password is correct, and that the identity string exactly matches `security find-identity -v -p codesigning`.
3. If notarization fails, read the notary log using the submission ID from the failed workflow. Fix the reported issue, then rerun the complete tagged release workflow. Do not distribute an unnotarized or unstapled build.
4. If app startup cannot create its daily or migration safety backup, preserve the database and available backups, check disk space and permissions, and make a separate copy before attempting recovery. The app stops before applying a migration if the required safety backup cannot be made.
5. For a corrupt or rejected restore file, keep the live database untouched and select a known-good backup through Settings. Restore validates SQLite integrity, migration history, schema, and foreign keys; it creates a safety backup before replacing the live file.
6. If replacement fails, the original database remains in place and the safety-backup path is reported. Preserve both files and contact the maintainer before further manual file operations.

## Version 1 boundaries

There is no cloud synchronization, shared concurrent multi-device ledger, login or employee attribution, barcode scanner, printer integration, supplier/purchase-order workflow, or App Store submission. The mobile web ledger is independent from desktop data. Web updates use the static host and service worker; desktop updates replace the application bundle manually and preserve the Application Support database. Database backups are not encrypted by the app.
