# Build, release, and recovery

## Requirements and local development

- Node.js 22.13 or newer; the release runner uses Node.js 22.23.3.
- npm 10.9 or newer and a clean `npm ci` from the committed lockfile.
- macOS 13 or newer and Xcode command-line tools for a client DMG. A macOS machine with the client's Developer ID identity and notarization access is required for a distributable release.

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

There is no cloud synchronization, concurrent multi-device use, login or employee attribution, barcode scanner, printer integration, supplier/purchase-order workflow, mobile client, App Store submission, or automatic updater. Updates replace the application bundle manually and preserve the Application Support database. Database backups are not encrypted by the app.
