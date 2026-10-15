# Siomai Inventory

An offline inventory and sales ledger for a Philippine food cart, available as a Mac desktop app and an installable mobile web app. It uses Philippine pesos and Asia/Manila business dates. Each device has an independent local ledger: the phone does not sync with the Mac. No account is required.

## Mobile web app

`npm run build:web` produces **`dist/web`**, ready for static HTTPS hosting. The phone version needs no Apple Developer subscription, Node application server, or hosted database. Open the hosted address in iPhone Safari while online, let it load fully, then use **Share → Add to Home Screen**. After the first complete online load, cached app files and the IndexedDB ledger work offline. Confirm an offline reopening before using it during service.

Export manual JSON backups to Files and keep copies outside the phone; the browser cannot create automatic external backups. Website-data deletion can erase the ledger. Desktop SQLite and web JSON backups are separate formats. See the [operator guide](docs/user-guide.md) for restore and update instructions.

For a production preview and mobile journey:

```sh
npm run build:web
npx playwright install chromium
npm run test:e2e:web
```

For manual inspection, run `npm run preview:web -- --host 127.0.0.1` in a separate terminal. The automated journey manages its own server: it builds this checkout, serves its output on an isolated loopback port, records a sale through the UI, and opens a new page in the same persistent browser profile offline after stopping the server. It uses Chromium with an iPhone 14 viewport; physical iPhone Safari acceptance remains part of the [release checklist](docs/acceptance-checklist.md). Loopback preview is for development; phone installation uses the hosted HTTPS address.

## Develop locally

Use Node.js 22.13 or newer and npm 10.9 or newer. Install the locked dependencies, then run:

```sh
npm ci
npm start
```

Run the checks and produce a local package with:

```sh
npm test
npm run typecheck
npm run lint
npm run test:e2e
npm run test:e2e:web
npm run package
node scripts/check-package.mjs
```

The E2E test launches Electron with a temporary user-data directory. macOS DMG creation, signing, notarization, and Gatekeeper acceptance need macOS and the client's Apple Developer credentials. See [Build and release](docs/build-and-release.md).

## Client handoff

- [Operator guide](docs/user-guide.md)
- [Build, release, and recovery guide](docs/build-and-release.md)
- [Release acceptance checklist](docs/acceptance-checklist.md)
- [CSV import templates](docs/import-templates/)
- [Changelog](CHANGELOG.md)

There is no cloud sync, accounts, barcode scanning, printer integration, or purchase-order workflow. Web updates are delivered by the static host and activate after old app windows close; desktop updates remain manual. Business data and backups are not encrypted by the app; keep backup copies in a protected location.
