# Changelog

## Unreleased — mobile web app

- Add an independent phone ledger backed by IndexedDB, with setup, products, stock workflows, sales/voids, reports, and CSV import/export.
- Install from Safari with Add to Home Screen; cache the production app shell for offline use after the first complete online load. No Apple Developer subscription is required for this distribution.
- Add a mobile bottom rail and More sheet, labelled record cards, safe-area spacing, and touch-sized controls.
- Export and restore versioned JSON ledger backups; show browser installation/storage guidance. Phone data does not sync with the Mac and requires manual external backups.
- Add `build:web`, `preview:web`, and `test:e2e:web`, static HTTPS release guidance, and an automated production online/offline journey. Preserve the packaged Electron build and E2E path.

## 1.0.0 — 2026-10-07

First client release of the offline Siomai Inventory desktop app.

- Record setup, opening stock, replenishments, piece and pack sales, transfers, and stock-count adjustments.
- Review daily and date-filtered sales, profit, inventory, discrepancy, valuation, and low-stock reports; export CSV files.
- Keep business data in the user's macOS Application Support directory, with daily, operation-safety, and manual SQLite backups.
- Install on macOS 13 or later on Intel and Apple Silicon using a signed and notarized universal DMG.
- Ship operator, maintenance, recovery, and release acceptance instructions with CSV templates.

Version 1 does not provide cloud synchronization, user accounts, barcode or printer integrations, supplier or purchase-order management, or automatic updates.
