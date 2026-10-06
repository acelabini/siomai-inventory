# Siomai Inventory

An offline desktop inventory and sales ledger for a Philippine food cart. The app stores its database on the Mac, uses Philippine pesos and Asia/Manila business dates, and needs no account or network connection for normal work.

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

The first release does not include cloud sync, accounts, barcode scanning, printer integration, purchase orders, or automatic updates. Business data and backups are not encrypted by the app; keep backup copies in a protected location.
