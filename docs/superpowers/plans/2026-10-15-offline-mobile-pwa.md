# Offline Mobile PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a phone-only, installable, offline Siomai Inventory PWA with full renderer workflow parity and no paid Apple developer account or application server.

**Architecture:** Preserve `InventoryApi` as the UI boundary. A browser runtime composes focused Dexie-backed services for catalog, stock, sales/reports, and files, while Electron keeps its preload API; a separate Vite PWA build precaches the app shell and the responsive renderer supplies a touch-first navigation rail and record-card tables.

**Tech Stack:** React 19, TypeScript 5.9, Vite 6, Dexie 4, IndexedDB, Zod 4, vite-plugin-pwa, Vitest, fake-indexeddb, Playwright, cross-env.

**Spec:** `docs/superpowers/specs/2026-10-15-offline-mobile-pwa-design.md`

## Global Constraints

- The mobile ledger is independent from the Mac and from every other device; add no accounts, cloud database, sync, or application server.
- Preserve the existing `InventoryApi` contract as the renderer boundary and leave Electron behavior intact.
- All business data stays in IndexedDB; service-worker caches contain application assets only.
- All multi-record mutations are atomic IndexedDB transactions.
- Reuse the existing Zod schemas and exact quantity/money arithmetic; balances are whole pieces and money is integer centavos.
- Business dates use `Asia/Manila`.
- The PWA must install from Safari, run offline after the first complete load, and require no Apple Developer Program membership.
- Browser backup format is versioned JSON; restore validates before mutation and never damages the current ledger on failure.
- At 760 px and below, primary controls are touch-first, minimum 44 by 44 CSS pixels, safe-area aware, keyboard accessible, and usable without horizontal table panning.
- Follow TDD for production behavior: capture RED output before implementation and GREEN output after implementation in each task report.
- Preserve all unrelated user changes and do not publish, push, or deploy.

## Review Focus

- A transaction interrupted after writing an audit row must not leave its balance or parent record partially updated; Task 2 tests rollback on a forced failure.
- Two near-simultaneous sales cannot both spend the same remaining stock; Task 3 tests serialized transaction behavior.
- A backup with a supported envelope but invalid cross-record references must be rejected without clearing current data; Task 4 tests referential validation and preservation.
- An update to cached application assets must not delete IndexedDB or replace it with stale cached API data; Task 5 tests upgrade/reload persistence and cache scope.
- Long product/location names, large peso values, and record action controls must remain readable and operable at 320 px; Task 6 adds focused renderer assertions and mobile E2E coverage.

---

### Task 1: Browser database, shared domain helpers, setup, and catalog

**Files:**
- Create: `src/browser/db.ts`
- Create: `src/browser/records.ts`
- Create: `src/browser/catalog-service.ts`
- Create: `src/shared/sample-products.ts`
- Create: `tests/browser/catalog-service.test.ts`
- Create: `tests/browser/test-database.ts`
- Modify: `src/main/domain/quantities.ts`
- Create: `src/shared/quantities.ts`
- Modify: `src/main/services/catalog-service.ts`
- Modify: `src/main/services/inventory-service.ts`
- Modify: `src/main/services/sales-service.ts`
- Modify: `tests/unit/quantities.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `BrowserDatabase extends Dexie`, `createBrowserDatabase(name: string): BrowserDatabase`, `deleteBrowserDatabase(name: string): Promise<void>`, typed records for every table in the spec, and `BrowserCatalogService` methods matching the setup/catalog subset of `InventoryApi`.
- Produces: `toPieces` and `describePieces` from `src/shared/quantities.ts`; the former main-domain module re-exports them for compatibility. Produces one browser-safe `sampleProducts` constant in `src/shared/sample-products.ts` consumed by both catalog services.

- [ ] **Step 1: Write failing database/catalog tests**

Add tests that assert a fresh database returns incomplete setup and sample products, setup commits business/location/sample products/opening balances atomically, duplicate SKU and location names reject, updates preserve IDs, archived records are hidden by default but available with `includeArchived`, and a forced setup failure leaves every table empty.

- [ ] **Step 2: Run the focused tests and capture RED**

First add a cross-platform `test:vitest` script backed by `cross-env`, then run: `npm run test:vitest -- tests/browser/catalog-service.test.ts tests/unit/quantities.test.ts`

Expected: FAIL because browser database/catalog modules do not exist.

- [ ] **Step 3: Add Dexie and fake IndexedDB dependencies and implement the schema**

Use Dexie `4.x`, `fake-indexeddb`, and `cross-env`; make the existing `test` script cross-platform and add `test:vitest` for focused files. Define schema version `1`, compound balance key `[locationId+productId]`, indexes required by later location/product/date queries, ISO timestamps, and table record types corresponding to the design.

- [ ] **Step 4: Move browser-safe quantity helpers and implement setup/catalog operations**

Validate public inputs with the existing schemas. Seed the existing sample products from one shared constant, enforce uniqueness, and wrap `completeSetup` in one Dexie transaction.

- [ ] **Step 5: Run focused tests and capture GREEN**

Run the Step 2 command. Expected: all focused tests pass with no warnings.

- [ ] **Step 6: Run typecheck and commit**

Run: `npm run typecheck`

Commit: `feat: add browser catalog storage`

### Task 2: Atomic browser inventory workflows

**Files:**
- Create: `src/browser/inventory-service.ts`
- Create: `tests/browser/inventory-service.test.ts`
- Modify: `src/browser/records.ts`
- Modify: `src/browser/db.ts`

**Interfaces:**
- Consumes: `BrowserDatabase`, typed records, `toPieces`, and existing stock-operation schemas.
- Produces: `BrowserInventoryService` implementing `setOpeningStock`, `recordReplenishment`, `transferStock`, `submitStockCount`, `getBalances`, and `getMovementHistory` with return types from `InventoryApi`.

- [ ] **Step 1: Write failing inventory workflow tests**

Cover piece/pack conversion, balance creation, cost snapshots, replenishment, transfer pairs, stock counts with required discrepancy reason, movement filters/limits, insufficient stock, same-location transfer, archived catalog references, and rollback after a deliberately injected mid-transaction failure.

- [ ] **Step 2: Run focused tests and capture RED**

Run the browser inventory and quantity test files; expect missing service failures.

- [ ] **Step 3: Implement inventory reads and atomic mutations**

Each operation validates with existing schemas, loads catalog records inside the transaction, computes exact pieces and costs, rejects negative results, and writes parent/line/movement/balance records in one Dexie transaction.

- [ ] **Step 4: Run focused tests and capture GREEN**

Expected: all browser inventory tests pass with no warnings.

- [ ] **Step 5: Run typecheck and commit**

Commit: `feat: add browser inventory workflows`

### Task 3: Browser sales and reporting

**Files:**
- Create: `src/browser/sales-service.ts`
- Create: `src/browser/report-service.ts`
- Create: `src/browser/time.ts`
- Create: `tests/browser/sales-service.test.ts`
- Create: `tests/browser/report-service.test.ts`
- Modify: `src/browser/records.ts`

**Interfaces:**
- Consumes: browser database/catalog/inventory records and existing sale/report schemas.
- Produces: `BrowserSalesService` implementing sale completion/list/void and `BrowserReportService` implementing all dashboard and report methods in `InventoryApi`.
- Produces: `manilaBusinessDate(instant?: Date): string` and deterministic date-boundary helpers.

- [ ] **Step 1: Write failing sales/report tests**

Cover price and cost snapshots, payment/change, insufficient payment/stock, one-time reasoned void, history filters, serialized near-simultaneous sales against one balance, Manila midnight boundaries, valuation, profit, discrepancy, low-stock, movement, and dashboard aggregation.

- [ ] **Step 2: Run focused tests and capture RED**

Expected: FAIL because browser sales/report services do not exist.

- [ ] **Step 3: Implement atomic sales and read-only reports**

Serialize stock spending through Dexie read/write transactions. Preserve snapshot values on void and generate the compensating `sale_void` movement exactly once. Aggregate reports from persisted snapshots and current product cost where the desktop contract does so.

- [ ] **Step 4: Run focused tests and capture GREEN**

Expected: all browser sales/report tests pass with no warnings.

- [ ] **Step 5: Run typecheck and commit**

Commit: `feat: add browser sales and reports`

### Task 4: Browser import, export, backup, and composed API

**Files:**
- Create: `src/browser/file-service.ts`
- Create: `src/browser/backup-format.ts`
- Create: `src/browser/browser-inventory-api.ts`
- Create: `src/browser/download.ts`
- Create: `tests/browser/file-service.test.ts`
- Create: `tests/browser/backup-service.test.ts`
- Create: `tests/browser/browser-inventory-api.test.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/renderer/api.ts`
- Modify: `src/renderer/pages/SettingsPage.tsx`
- Modify: `tests/renderer/settings-page.test.tsx`

**Interfaces:**
- Consumes: all browser services and the existing `InventoryApi` contract.
- Produces: `BrowserInventoryApi implements InventoryApi`, `createBrowserInventoryApi(options?): InventoryApi`, `getInventoryApi()` runtime selection, and backup envelope `{ format: 'siomai-inventory-web-backup', version: 1, createdAt: string, tables: Record<BrowserTableName, unknown[]> }`.
- Extends `getSettings()` result with optional `runtime: 'desktop' | 'web'`, `automaticBackups: boolean`, and `storagePersistent?: boolean` so Settings can render truthful platform copy.

- [ ] **Step 1: Write failing file/API tests**

Cover CSV picker cancellation and 5 MB rejection, preview/commit parity for all three import kinds, report CSV content and deterministic filenames, backup export, full round-trip restore, rejection of newer/invalid/cross-reference-broken backups without data loss, runtime API selection, and web-specific Settings copy.

- [ ] **Step 2: Run focused tests and capture RED**

Expected: FAIL because browser file, backup, and API modules do not exist.

- [ ] **Step 3: Implement import/export and backup validation**

Reuse or extract pure CSV parsing rules from the current import/export services instead of duplicating business mappings. Use browser file input and Blob download/share adapters behind injected test seams. Validate the complete backup envelope and references before a single replacement transaction.

- [ ] **Step 4: Compose the browser API and adapt Settings copy**

Select Electron only when `window.inventoryApi` exists; otherwise memoize one browser API instance. Request persistent storage when supported. Settings must say manual exported backups for web and retain existing automatic-backup text for desktop.

- [ ] **Step 5: Run focused tests and capture GREEN**

Expected: all Task 4 tests pass with no warnings.

- [ ] **Step 6: Run browser service suite and typecheck, then commit**

Commit: `feat: complete browser inventory api`

### Task 5: Standalone PWA build and offline application shell

**Files:**
- Create: `vite.web.config.ts`
- Create: `src/renderer/components/InstallNotice.tsx`
- Create: `tests/renderer/install-notice.test.tsx`
- Create: `tests/pwa-config.test.ts`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/main.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `scripts/create-assets.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `assets/pwa/icon-192.png`
- Create: `assets/pwa/icon-512.png`
- Create: `assets/pwa/apple-touch-icon.png`

**Interfaces:**
- Produces: `npm run build:web` to `dist/web`, `npm run preview:web`, a manifest named “Siomai Inventory”, generated Workbox service worker, iOS icons/meta, and `InstallNotice` driven by display mode, iOS detection, and storage-persistence state.

- [ ] **Step 1: Write failing PWA configuration and install-notice tests**

Assert standalone manifest metadata/icons/theme, navigable fallback, application-shell-only cache configuration, iOS Safari instructions only when not installed, dismissal persistence, storage warning behavior, and that an IndexedDB value survives simulated application update/reinitialization.

- [ ] **Step 2: Run focused tests and capture RED**

Expected: FAIL because the PWA configuration and install notice do not exist.

- [ ] **Step 3: Add the standalone Vite PWA build and assets**

Configure `vite-plugin-pwa` only in `vite.web.config.ts`, precache generated assets, avoid API/runtime data caching, add safe manifest/iOS metadata, and extend the existing deterministic asset generator for all PNG sizes.

- [ ] **Step 4: Add install and storage guidance**

Render a non-blocking notice after setup. It explains Safari Add to Home Screen on iOS and links storage-risk guidance to Settings without claiming data is externally backed up.

- [ ] **Step 5: Run focused tests, build web, and capture GREEN**

Run the Task 5 tests and `npm run build:web`; expect passing tests and a generated `dist/web/manifest.webmanifest` plus service worker.

- [ ] **Step 6: Run typecheck and commit**

Commit: `feat: add installable offline pwa build`

### Task 6: Touch-first mobile shell and record-card tables

**Files:**
- Modify: `src/renderer/components/AppShell.tsx`
- Modify: `src/renderer/components/DataTable.tsx`
- Modify: `src/renderer/components/ui/AppIcon.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `tests/renderer/app-shell.test.tsx`
- Modify: `tests/renderer/ui-components.test.tsx`
- Create: `tests/renderer/mobile-layout.test.tsx`

**Interfaces:**
- Produces: mobile bottom navigation with Overview/New sale/Inventory/More, accessible modal navigation sheet for secondary destinations, and `data-label` card cells derived from `DataColumn.label`.

- [ ] **Step 1: Write failing mobile interaction and semantic tests**

Assert primary destinations, More open/close and focus restoration, active state for a secondary destination, Escape/backdrop dismissal, 44 px target selectors, safe-area declarations, card cell labels, long content wrapping at 320 px, and no hidden record actions.

- [ ] **Step 2: Run focused renderer tests and capture RED**

Expected: FAIL because mobile navigation and labeled card cells do not exist.

- [ ] **Step 3: Implement the responsive shell and card tables**

Keep the desktop sidebar above 760 px. Below it, render the safe-area bottom rail and accessible More sheet, compact the context header, reserve bottom workspace space, convert tables to labeled cards, and preserve print styles and reduced-motion behavior.

- [ ] **Step 4: Critique the rendered direction and remove generic or redundant decoration**

Use a mobile screenshot at 390 by 844. Confirm the cart-order-rail signature is recognizable, typography and colors remain specific to Siomai Inventory, and one visual accent carries the design; remove any competing decoration.

- [ ] **Step 5: Run focused tests and capture GREEN**

Expected: all shell/component/mobile tests pass with no warnings.

- [ ] **Step 6: Run typecheck and commit**

Commit: `feat: add touch-first mobile interface`

### Task 7: Mobile browser journey, offline verification, and operator documentation

**Files:**
- Create: `tests/e2e/mobile-web.spec.ts`
- Modify: `playwright.config.ts` if present, otherwise create it with existing Electron coverage preserved
- Modify: `docs/user-guide.md`
- Modify: `docs/build-and-release.md`
- Modify: `docs/acceptance-checklist.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: complete web build and mobile UI.
- Produces: `npm run test:e2e:web`, documented static-host artifact `dist/web`, Safari install/recovery instructions, and an acceptance path for first-load online then offline operation.

- [ ] **Step 1: Write the failing mobile web E2E journey**

At an iPhone 14-class viewport, complete setup, create a priced product/opening stock, complete a sale, reload and verify the receipt/history persists, navigate through More, verify manifest/service-worker registration, then launch a new page context offline and verify the cached shell and persisted dashboard load.

- [ ] **Step 2: Run the mobile E2E test and capture RED**

Expected: a specific missing script/config/behavior failure before final wiring.

- [ ] **Step 3: Complete E2E harness and documentation**

Serve `dist/web` on loopback for Playwright without an external deployment. Document static HTTPS hosting, independent device data, installation, first-load requirement, backup cadence, restore, update behavior, and the fact that no Apple subscription is needed.

- [ ] **Step 4: Run the mobile E2E test and capture GREEN**

Run: `npm run test:e2e:web`

Expected: the mobile online/offline journey passes.

- [ ] **Step 5: Run the complete verification matrix**

Run: browser/unit/renderer tests, existing integration tests with the two documented Windows baseline backup failures separated, `npm run typecheck`, `npm run lint`, `npm run build:web`, `npm run package`, `npm run check:package`, and `npm run test:e2e:web`.

- [ ] **Step 6: Commit**

Commit: `docs: add mobile pwa release guidance`
