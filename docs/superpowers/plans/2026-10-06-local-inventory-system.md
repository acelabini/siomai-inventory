# Local Inventory System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an offline Electron desktop application that manages products, per-location stock, piece/pack sales, replenishments, transfers, daily counts, reports, imports, and recoverable backups for a Mac-based client.

**Architecture:** Electron Forge hosts a sandboxed React renderer behind a typed preload bridge. The main process owns a better-sqlite3 database and calls focused domain services; all stock-affecting workflows append immutable ledger entries inside SQLite transactions. A macOS release workflow builds a universal signed/notarized DMG when client-owned Apple credentials are supplied.

**Tech Stack:** Electron 44, Electron Forge with Vite, React 19, TypeScript, better-sqlite3, Zod, Vitest, React Testing Library, Playwright Electron, CSS Modules/plain CSS, GitHub Actions macOS runner

**Spec:** `docs/superpowers/specs/2026-10-06-local-inventory-system-design.md`

## Global Constraints

- Support macOS 13 Ventura or later on Apple Silicon and Intel Macs.
- Normal operation is fully offline with no analytics, telemetry, remote fonts, or third-party content.
- Currency is PHP, money is stored as integer centavos, and business dates use Asia/Manila.
- Stock is stored as whole pieces; packs are converted using each product's positive integer `piecesPerPack`.
- Negative stock is blocked for sales and transfers.
- The renderer is sandboxed with context isolation enabled and Node integration disabled.
- Products and locations referenced by history are archived, never physically deleted.
- Database files live under Electron's `userData` directory and survive application upgrades.
- Final signing credentials remain outside the repository.

## Review Focus

- Decimal pack input that does not convert to a whole number of pieces must be rejected with a useful error; pin this in Task 2 conversion tests.
- Two sales racing for the last stock must not oversell; pin this with sequential transaction integration coverage in Task 5.
- Voiding the same sale twice must not duplicate returned stock; pin this in Task 5.
- An invalid or incompatible backup must leave the live database untouched; pin this in Task 8.
- CSV rows with duplicate SKUs or ambiguous product names must fail before any rows are committed; pin this in Task 7.

---

## File Structure

```text
assets/                         application and installer artwork
docs/
  acceptance-checklist.md       client release verification
  build-and-release.md          local and signed macOS build process
  user-guide.md                 non-technical operating guide
  import-templates/             CSV templates and examples
src/
  main.ts                       Electron lifecycle and window creation
  preload.ts                    narrow typed renderer bridge
  shared/
    contracts.ts                IPC DTOs and public bridge types
    schemas.ts                  Zod boundary validation
  main/
    db/
      database.ts               SQLite open, pragmas, migration runner
      migrations.ts             versioned SQL migrations
      test-database.ts          temporary database helper
    domain/
      quantities.ts             pack/piece conversion and display
      money.ts                  centavo calculations and formatting inputs
    services/
      catalog-service.ts        settings, products, and locations
      inventory-service.ts      ledger, balances, replenishment, transfer, count
      sales-service.ts          checkout, listing, and voiding
      report-service.ts         dashboard and filtered report projections
      import-service.ts         CSV parsing, mapping, preview, and commit
      backup-service.ts         automatic/manual backup and restore validation
    ipc/
      register-handlers.ts      validated IPC registrations
  renderer/
    index.html                  renderer document and CSP
    main.tsx                    React entry point
    App.tsx                     navigation and route composition
    api.ts                      typed preload client adapter
    styles.css                  tokens, layout, accessibility, tables
    components/                 reusable shell, forms, tables, dialogs
    pages/                      setup and business workflow screens
tests/
  unit/                         domain unit tests
  integration/                  service/database tests
  renderer/                     component and page tests
  e2e/                          packaged Electron smoke test
forge.config.ts                 packaging, native module, DMG, signing config
vite.*.config.ts                main, preload, and renderer builds
```

## Task 1: Secure Electron Foundation

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `forge.config.ts`
- Create: `vite.main.config.ts`
- Create: `vite.preload.config.ts`
- Create: `vite.renderer.config.ts`
- Create: `src/main.ts`
- Create: `src/preload.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/styles.css`
- Create: `src/shared/contracts.ts`
- Create: `tests/unit/security-config.test.ts`

**Interfaces:**
- Consumes: none
- Produces: `window.inventoryApi: InventoryApi`, secure `BrowserWindow` defaults, npm scripts `start`, `test`, `typecheck`, `lint`, `package`, and `make`

- [ ] **Step 1: Write the failing security configuration test**

Assert that the exported window preferences set `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, reference the preload bundle, and that the renderer HTML contains a CSP allowing local application assets only.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- tests/unit/security-config.test.ts`

Expected: FAIL because the application configuration does not exist.

- [ ] **Step 3: Scaffold the Electron Forge/Vite/React project**

Pin Electron to the latest supported 44.x patch available during installation. Add TypeScript strict mode, Vitest with jsdom, React Testing Library, ESLint, and Forge's native-module unpack/rebuild support. Export `createWindowOptions(preloadPath: string): Electron.BrowserWindowConstructorOptions` from `src/main.ts` so the security settings are testable without opening Electron.

- [ ] **Step 4: Expose an initially empty typed bridge**

Define `InventoryApi` in `src/shared/contracts.ts`, expose it with `contextBridge.exposeInMainWorld`, declare the global window type, and render a minimal shell that proves the renderer loads without Node access.

- [ ] **Step 5: Run foundation verification**

Run: `npm test -- tests/unit/security-config.test.ts && npm run typecheck && npm run lint`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json forge.config.ts vite.*.config.ts src tests/unit/security-config.test.ts docs
git commit -m "build: scaffold secure electron inventory app"
```

## Task 2: Database, Migrations, Quantities, and Money

**Files:**
- Create: `src/main/db/database.ts`
- Create: `src/main/db/migrations.ts`
- Create: `src/main/db/test-database.ts`
- Create: `src/main/domain/quantities.ts`
- Create: `src/main/domain/money.ts`
- Create: `tests/unit/quantities.test.ts`
- Create: `tests/unit/money.test.ts`
- Create: `tests/integration/migrations.test.ts`

**Interfaces:**
- Consumes: Electron user-data path supplied by `src/main.ts`
- Produces: `openDatabase(path: string): Database.Database`, `migrateDatabase(db): void`, `toPieces(quantity: number, unit: 'piece' | 'pack', piecesPerPack: number): number`, `describePieces(pieces: number, piecesPerPack: number): QuantityDisplay`, `pesosToCentavos(value: string): number`, and `centavosToPesos(value: number): string`

- [ ] **Step 1: Write failing quantity and money tests**

Cover piece entry, whole and decimal pack entry that maps exactly to pieces, decimal pack entry that would create a fraction of a piece, zero/negative values, `66` pieces per pack, PHP rounding boundaries, and rejection of more than two currency decimals.

- [ ] **Step 2: Run unit tests and confirm failure**

Run: `npm test -- tests/unit/quantities.test.ts tests/unit/money.test.ts`

Expected: FAIL because the domain helpers do not exist.

- [ ] **Step 3: Implement pure quantity and money helpers**

Use integer arithmetic after parsing; do not use binary floating-point values as persisted money. `toPieces` must reject conversions whose result is not a safe whole integer.

- [ ] **Step 4: Write the failing migration test**

Assert a fresh database creates `settings`, `locations`, `products`, `stock_movements`, `inventory_balances`, `sales`, `sale_lines`, `transfers`, `stock_counts`, `stock_count_lines`, `schema_migrations`, and `backup_history`, with foreign keys enabled and migration re-runs idempotent.

- [ ] **Step 5: Implement the migration runner and temporary database helper**

`openDatabase` enables WAL mode for the live database, foreign keys, busy timeout, and safe integer handling. `migrateDatabase` applies each numbered migration once inside a transaction.

- [ ] **Step 6: Run domain/database verification**

Run: `npm test -- tests/unit/quantities.test.ts tests/unit/money.test.ts tests/integration/migrations.test.ts`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/main/db src/main/domain tests/unit tests/integration/migrations.test.ts
git commit -m "feat: add inventory database and value objects"
```

## Task 3: Catalog and First-Run Setup

**Files:**
- Create: `src/shared/schemas.ts`
- Create: `src/main/services/catalog-service.ts`
- Create: `src/main/ipc/register-handlers.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/main.ts`
- Modify: `src/preload.ts`
- Create: `src/renderer/api.ts`
- Create: `src/renderer/pages/SetupPage.tsx`
- Create: `src/renderer/pages/ProductsPage.tsx`
- Create: `src/renderer/pages/LocationsPage.tsx`
- Create: `tests/integration/catalog-service.test.ts`
- Create: `tests/renderer/setup-page.test.tsx`

**Interfaces:**
- Consumes: `openDatabase`, migrated catalog tables
- Produces: `CatalogService` methods `getSetupState`, `completeSetup`, `listProducts`, `saveProduct`, `archiveProduct`, `listLocations`, `saveLocation`, `archiveLocation`; matching Promise-returning `InventoryApi` methods

- [ ] **Step 1: Write failing catalog service tests**

Assert unique SKUs, positive pieces per pack, integer centavo fields, at least one active location on setup completion, seeded siomai products, archive-not-delete behavior, and rejection of archiving the last active location.

- [ ] **Step 2: Run catalog tests and confirm failure**

Run: `npm test -- tests/integration/catalog-service.test.ts`

Expected: FAIL because `CatalogService` is missing.

- [ ] **Step 3: Implement schemas, catalog service, and validated IPC**

Use Zod DTO schemas at IPC registration. Map database errors to stable application error codes rather than returning raw SQL errors.

- [ ] **Step 4: Write failing first-run UI tests**

Assert business name and location are required, sample products can be selected, opening-stock step cannot accept negative values, and completion calls the typed API with normalized data.

- [ ] **Step 5: Implement first-run, product, and location screens**

Route incomplete setups to `SetupPage`; completed setups enter the main shell. Use accessible labels, field-level messages, and archive confirmations.

- [ ] **Step 6: Verify catalog and setup**

Run: `npm test -- tests/integration/catalog-service.test.ts tests/renderer/setup-page.test.tsx && npm run typecheck`

Expected: tests pass and TypeScript reports no errors.

- [ ] **Step 7: Commit**

```bash
git add src/shared src/main/services/catalog-service.ts src/main/ipc src/main.ts src/preload.ts src/renderer tests/integration/catalog-service.test.ts tests/renderer/setup-page.test.tsx
git commit -m "feat: add catalog and first-run setup"
```

## Task 4: Inventory Ledger, Replenishment, Transfers, and Counts

**Files:**
- Create: `src/main/services/inventory-service.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/shared/schemas.ts`
- Modify: `src/main/ipc/register-handlers.ts`
- Modify: `src/preload.ts`
- Create: `src/renderer/pages/InventoryPage.tsx`
- Create: `src/renderer/pages/ReplenishPage.tsx`
- Create: `src/renderer/pages/TransfersPage.tsx`
- Create: `src/renderer/pages/StockCountPage.tsx`
- Create: `tests/integration/inventory-service.test.ts`
- Create: `tests/renderer/stock-workflows.test.tsx`

**Interfaces:**
- Consumes: catalog IDs, `toPieces`, stock tables
- Produces: `InventoryService` methods `setOpeningStock`, `recordReplenishment`, `transferStock`, `submitStockCount`, `getBalances`, `getMovementHistory`; matching renderer API methods

- [ ] **Step 1: Write failing ledger integration tests**

Assert opening balances, multi-line replenishment, cost snapshots, atomic paired transfers, insufficient-stock rollback, same-location transfer rejection, expected-versus-counted discrepancy, mandatory discrepancy reason, and balance equality with ledger sums.

- [ ] **Step 2: Run inventory tests and confirm failure**

Run: `npm test -- tests/integration/inventory-service.test.ts`

Expected: FAIL because `InventoryService` is missing.

- [ ] **Step 3: Implement transactional inventory service**

Every public write method opens one immediate SQLite transaction, appends immutable movements, and updates `inventory_balances` by the same signed piece delta. Return structured receipts containing affected products and post-operation balances.

- [ ] **Step 4: Write failing workflow UI tests**

Assert pack/piece switching, visible availability, conversion preview, total cost, transfer destination validation, stock-count difference display, required discrepancy reason, and success-reset behavior.

- [ ] **Step 5: Implement inventory workflow screens and IPC methods**

Use shared product/location selectors, line editors, confirmation summaries, and localized PHP/quantity presentation.

- [ ] **Step 6: Verify ledger workflows**

Run: `npm test -- tests/integration/inventory-service.test.ts tests/renderer/stock-workflows.test.tsx && npm run typecheck`

Expected: all checks pass.

- [ ] **Step 7: Commit**

```bash
git add src/main/services/inventory-service.ts src/main/ipc src/shared src/preload.ts src/renderer tests/integration/inventory-service.test.ts tests/renderer/stock-workflows.test.tsx
git commit -m "feat: add stock ledger workflows"
```

## Task 5: Transaction-Level Sales and Reversals

**Files:**
- Create: `src/main/services/sales-service.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/shared/schemas.ts`
- Modify: `src/main/ipc/register-handlers.ts`
- Modify: `src/preload.ts`
- Create: `src/renderer/pages/SalesPage.tsx`
- Create: `src/renderer/components/SaleComposer.tsx`
- Create: `src/renderer/components/SaleReceipt.tsx`
- Create: `tests/integration/sales-service.test.ts`
- Create: `tests/renderer/sale-composer.test.tsx`

**Interfaces:**
- Consumes: product price/cost snapshots, `InventoryService` balance semantics, quantity/money helpers
- Produces: `SalesService.completeSale(input): SaleReceipt`, `listSales(filter): SaleSummary[]`, and `voidSale(saleId, reason): SaleReceipt`; matching renderer API methods

- [ ] **Step 1: Write failing sales integration tests**

Cover mixed pack/piece lines, duplicate-product line consolidation, centavo-safe totals, payment/change, insufficient payment, insufficient inventory, rollback of all lines on failure, historical price/cost snapshots, sequential attempts to sell the last stock, successful void reversal, and double-void rejection.

- [ ] **Step 2: Run sales tests and confirm failure**

Run: `npm test -- tests/integration/sales-service.test.ts`

Expected: FAIL because `SalesService` is missing.

- [ ] **Step 3: Implement sale completion, queries, and reversal**

Re-check balances inside an immediate transaction. Insert sale, lines, and negative movements atomically. `voidSale` changes status once and creates explicit positive reversal movements linked to the original sale.

- [ ] **Step 4: Write failing sale composer tests**

Assert product search, unit toggle, availability, line totals, removal, amount tendered, change, disabled completion for invalid state, API error display, receipt display, and explicit void confirmation.

- [ ] **Step 5: Implement sale screens**

Prioritize keyboard operation: product search, quantity input, add line, tendered amount, and completion. Preserve typed input when recoverable validation fails.

- [ ] **Step 6: Verify sales**

Run: `npm test -- tests/integration/sales-service.test.ts tests/renderer/sale-composer.test.tsx && npm run typecheck`

Expected: all checks pass.

- [ ] **Step 7: Commit**

```bash
git add src/main/services/sales-service.ts src/main/ipc src/shared src/preload.ts src/renderer tests/integration/sales-service.test.ts tests/renderer/sale-composer.test.tsx
git commit -m "feat: add sales checkout and reversals"
```

## Task 6: Dashboard, Reports, and Application Shell

**Files:**
- Create: `src/main/services/report-service.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/shared/schemas.ts`
- Modify: `src/main/ipc/register-handlers.ts`
- Modify: `src/preload.ts`
- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/components/AppShell.tsx`
- Create: `src/renderer/components/DataTable.tsx`
- Create: `src/renderer/components/MetricCard.tsx`
- Create: `src/renderer/pages/DashboardPage.tsx`
- Create: `src/renderer/pages/ReportsPage.tsx`
- Create: `tests/integration/report-service.test.ts`
- Create: `tests/renderer/dashboard.test.tsx`

**Interfaces:**
- Consumes: immutable ledger, sales snapshots, location/product catalogs
- Produces: `ReportService.getDashboard(filter): DashboardReport`, `getSalesReport`, `getMovementReport`, `getValuationReport`, `getProfitReport`, `getDiscrepancyReport`, and `getLowStockReport`; navigation shell

- [ ] **Step 1: Write failing report integration tests**

Seed two locations across two Asia/Manila business dates. Assert location/date isolation, opening/replenished/sold/remaining quantities, revenue, cost, gross profit, stock value, discrepancy count, low-stock state, and exclusion of voided-sale revenue.

- [ ] **Step 2: Run report tests and confirm failure**

Run: `npm test -- tests/integration/report-service.test.ts`

Expected: FAIL because `ReportService` is missing.

- [ ] **Step 3: Implement report projections**

Use parameterized queries and return display-neutral integer values. Centralize conversion of UTC timestamps into Asia/Manila business-day boundaries.

- [ ] **Step 4: Write failing dashboard tests**

Assert default date/location filters, five summary metrics, spreadsheet-inspired inventory columns, sticky/table semantics, low-stock text plus icon, empty state actions, report filter changes, and print command invocation.

- [ ] **Step 5: Implement the full application shell, dashboard, and reports**

Use warm neutral surfaces, restrained green accents, tabular numerals, visible focus states, compact desktop spacing, and responsive table overflow at 1024 pixels. Sidebar items: Dashboard, Sales, Inventory, Replenish, Transfers, Stock Count, Reports, Products, Locations, Settings.

- [ ] **Step 6: Verify reports and accessibility basics**

Run: `npm test -- tests/integration/report-service.test.ts tests/renderer/dashboard.test.tsx && npm run typecheck && npm run lint`

Expected: all checks pass.

- [ ] **Step 7: Commit**

```bash
git add src/main/services/report-service.ts src/main/ipc src/shared src/preload.ts src/renderer tests/integration/report-service.test.ts tests/renderer/dashboard.test.tsx
git commit -m "feat: add inventory dashboard and reports"
```

## Task 7: CSV Import and Export

**Files:**
- Create: `src/main/services/import-service.ts`
- Create: `src/main/services/export-service.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/shared/schemas.ts`
- Modify: `src/main/ipc/register-handlers.ts`
- Modify: `src/preload.ts`
- Create: `src/renderer/pages/ImportPage.tsx`
- Modify: `src/renderer/pages/ReportsPage.tsx`
- Create: `docs/import-templates/products.csv`
- Create: `docs/import-templates/opening-stock.csv`
- Create: `docs/import-templates/spreadsheet-example.csv`
- Create: `tests/integration/import-service.test.ts`
- Create: `tests/integration/export-service.test.ts`
- Create: `tests/renderer/import-page.test.tsx`

**Interfaces:**
- Consumes: catalog/inventory services, Electron file dialogs, report DTOs
- Produces: `ImportService.preview`, `commit`, `ExportService.reportToCsv`, and typed file-dialog IPC methods

- [ ] **Step 1: Write failing import/export service tests**

Cover quoted CSV fields, UTF-8 BOM, required columns, mapping, row-numbered errors, duplicate SKU, ambiguous name, exact pack conversion, spreadsheet aggregate labeling, full rollback when any row is invalid, safe CSV formula escaping, and correct PHP centavo export.

- [ ] **Step 2: Run service tests and confirm failure**

Run: `npm test -- tests/integration/import-service.test.ts tests/integration/export-service.test.ts`

Expected: FAIL because import/export services are missing.

- [ ] **Step 3: Implement staged import and report export**

Preview parses and validates without writes. Commit takes the validated preview token/content hash, revalidates, and writes the whole import in one transaction. Export prefixes fields beginning with `=`, `+`, `-`, or `@` to prevent spreadsheet formula execution.

- [ ] **Step 4: Write failing import page tests**

Assert choose-file cancellation, column mapping, preview counts, row-specific errors, commit disabled on errors, success navigation, and no invented sales for aggregate data.

- [ ] **Step 5: Implement import UI, report export action, and templates**

Use the four explicit stages from the specification. Add Import to Settings/setup rather than the primary navigation.

- [ ] **Step 6: Verify import/export**

Run: `npm test -- tests/integration/import-service.test.ts tests/integration/export-service.test.ts tests/renderer/import-page.test.tsx && npm run typecheck`

Expected: all checks pass.

- [ ] **Step 7: Commit**

```bash
git add src/main/services/import-service.ts src/main/services/export-service.ts src/main/ipc src/shared src/preload.ts src/renderer docs/import-templates tests
git commit -m "feat: add validated CSV import and export"
```

## Task 8: Backups, Restore, Settings, and Recovery

**Files:**
- Create: `src/main/services/backup-service.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/shared/schemas.ts`
- Modify: `src/main/ipc/register-handlers.ts`
- Modify: `src/main.ts`
- Modify: `src/preload.ts`
- Create: `src/renderer/pages/SettingsPage.tsx`
- Create: `tests/integration/backup-service.test.ts`
- Create: `tests/renderer/settings-page.test.tsx`

**Interfaces:**
- Consumes: live database path, migrated schema version, Electron dialogs/relaunch
- Produces: `BackupService.createAutomatic`, `createManual`, `validateBackup`, `restoreBackup`, `pruneAutomaticBackups`; settings/backup IPC methods

- [ ] **Step 1: Write failing backup integration tests**

Assert one startup backup per Manila date, 30-day retention, consistent SQLite backup content, pre-operation backups, rejection of corrupt/foreign/newer-schema files, pre-restore safety backup, and unchanged live data after invalid restore.

- [ ] **Step 2: Run backup tests and confirm failure**

Run: `npm test -- tests/integration/backup-service.test.ts`

Expected: FAIL because `BackupService` is missing.

- [ ] **Step 3: Implement backup and restore orchestration**

Use SQLite's backup API for live snapshots and atomic filesystem replacement for restore. Close the live connection only after validation; if replacement fails, restore the safety copy and return a stable recovery error.

- [ ] **Step 4: Write failing settings page tests**

Assert business-name editing, displayed fixed currency/timezone, backup directory choice, manual backup success, restore confirmation naming the file, cancellation, invalid-backup error, and relaunch request after success.

- [ ] **Step 5: Implement settings and startup backup flow**

Run migration backup before migrations on an existing database, then migrate, then create the once-daily startup backup. Prevent simultaneous import/restore/migration actions with a main-process operation lock.

- [ ] **Step 6: Verify recovery flows**

Run: `npm test -- tests/integration/backup-service.test.ts tests/renderer/settings-page.test.tsx && npm run typecheck`

Expected: all checks pass.

- [ ] **Step 7: Commit**

```bash
git add src/main/services/backup-service.ts src/main/ipc src/main.ts src/shared src/preload.ts src/renderer/pages/SettingsPage.tsx tests
git commit -m "feat: add backup restore and settings"
```

## Task 9: Packaging, End-to-End Test, Documentation, and Release Workflow

**Files:**
- Modify: `forge.config.ts`
- Create: `.github/workflows/macos-release.yml`
- Create: `assets/icon.icns`
- Create: `assets/dmg-background.png`
- Create: `tests/e2e/app.spec.ts`
- Create: `scripts/check-package.mjs`
- Create: `docs/user-guide.md`
- Create: `docs/build-and-release.md`
- Create: `docs/acceptance-checklist.md`
- Create: `CHANGELOG.md`
- Create: `README.md`

**Interfaces:**
- Consumes: completed renderer/main application, Apple signing secrets supplied only in CI or macOS Keychain
- Produces: distributable universal macOS DMG workflow, local development instructions, client operating guide, acceptance evidence

- [ ] **Step 1: Write the failing Electron end-to-end smoke test**

Exercise first-run setup, opening stock, piece sale, pack sale, transfer, stock count discrepancy, report export, application restart, persisted balances, sale void, and manual backup. Use a temporary user-data directory.

- [ ] **Step 2: Run the E2E test and confirm its initial failure**

Run: `npm run test:e2e`

Expected: FAIL until stable test selectors and lifecycle hooks are complete.

- [ ] **Step 3: Complete test hooks and packaging configuration**

Set the product name, bundle identifier, macOS 13 minimum, icons, DMG layout, hardened runtime, entitlements, universal architecture merge, and environment-driven signing/notarization. `scripts/check-package.mjs` must assert no development URL, no signing secret, valid CSP, and correct app metadata in packaged output.

- [ ] **Step 4: Add the macOS release workflow**

On a version tag, install locked dependencies, run unit/integration/renderer tests, build x64 and arm64 artifacts, merge/package the universal app, sign with Developer ID, notarize, staple the ticket, run `spctl` and `codesign` verification, and upload the DMG plus checksums. Fail clearly when required secrets are absent.

- [ ] **Step 5: Write client and maintainer documentation**

Document installation, setup, daily sale/replenishment/transfer/count tasks, report export, backup/restore, update procedure, CSV formats, data location, signing prerequisites, CI secret names, recovery steps, and the version 1 non-goals.

- [ ] **Step 6: Run complete verification**

Run: `npm test && npm run typecheck && npm run lint && npm run test:e2e && npm run package && node scripts/check-package.mjs`

Expected: all commands exit 0 on the development platform. Record any platform-specific skipped DMG/signing checks in `docs/acceptance-checklist.md` for mandatory execution on macOS.

- [ ] **Step 7: Perform macOS release acceptance**

On macOS with the client's Apple credentials, create the universal DMG, verify `codesign --verify --deep --strict`, `spctl --assess --type execute`, notarization/stapling, installation on Apple Silicon and Intel, first launch, upgrade data preservation, and restore from backup. Attach the completed checklist to the release.

- [ ] **Step 8: Commit**

```bash
git add forge.config.ts .github assets tests/e2e scripts docs README.md CHANGELOG.md
git commit -m "release: add macOS packaging and client handoff"
```

## Final Verification

- [ ] Run `npm test` and confirm all unit, integration, and renderer tests pass.
- [ ] Run `npm run typecheck` and `npm run lint` with zero errors.
- [ ] Run the Electron E2E smoke test against a temporary data directory.
- [ ] Build the local package and run the package security checker.
- [ ] Inspect `git status --short` and confirm only intentional files remain.
- [ ] Complete the macOS-only signed DMG checklist before calling the client deliverable ready.
