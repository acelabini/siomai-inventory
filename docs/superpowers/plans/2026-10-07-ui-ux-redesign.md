# Siomai Inventory UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved operator-focused design system and interaction improvements to every Siomai Inventory renderer page without changing ledger behavior.

**Architecture:** Keep the existing React/Electron view switching and `InventoryApi` boundary. Add a small renderer-only component system, migrate the shared shell first, then update pages in workflow groups so every task leaves a testable application state. Use existing API calls and derived presentation data; do not change the database or main-process services.

**Tech Stack:** React 19, TypeScript 5.9, Electron 44, Vite 6, Vitest, Testing Library, Playwright, CSS, bundled `lucide-react` icons

**Spec:** `docs/superpowers/specs/2026-10-07-ui-ux-redesign-design.md`

## Global Constraints

- Preserve the current React/Electron architecture and all existing `InventoryApi` contracts.
- Do not change database schemas, domain calculations, import semantics, backup format, or report definitions.
- The application must remain fully offline; runtime code may not fetch fonts, icons, images, telemetry, or other assets.
- Bundle `lucide-react`; expose icons to pages only through the local `AppIcon` wrapper.
- Keep PHP currency formatting, Asia/Manila dates, exact centavo arithmetic, and tabular numeric alignment.
- Preserve report printing and suppress the shared shell and interactive controls in print output.
- Keep semantic landmarks and headings, visible field labels, text-plus-icon statuses, keyboard focus, live feedback, and reduced-motion support.
- Support wide, medium, and narrow desktop windows without hiding content or actions.
- Keep user-facing actions in sentence case and use the same verb in button, loading, success, and error copy.

## Review Focus

- A 760px-wide window must keep every page action reachable, stack workflow summaries, and contain wide tables without covering content; Task 8 adds the responsive end-to-end assertion.
- Very long business, product, location, and backup names must wrap or truncate with an accessible full value instead of overlapping adjacent controls; Tasks 2, 6, and 8 pin this behavior.
- Recoverable API failures must retain entered form values and expose a specific `role="alert"` message; Tasks 4, 5, 6, and 7 exercise this state.
- Confirm dialogs must receive focus, support Escape cancellation, restore focus, and never perform the destructive action after cancellation; Tasks 1, 4, and 6 verify the behavior.
- Zero stock, zero prices, large peso values, and signed discrepancies must remain readable and semantically labeled; Tasks 1, 3, and 5 cover these values.

---

### Task 1: Renderer Design System and Accessible Primitives

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/renderer/styles.css`
- Create: `src/renderer/components/ui/AppIcon.tsx`
- Create: `src/renderer/components/ui/Button.tsx`
- Create: `src/renderer/components/ui/PageHeader.tsx`
- Create: `src/renderer/components/ui/Field.tsx`
- Create: `src/renderer/components/ui/Panel.tsx`
- Create: `src/renderer/components/ui/StatusBadge.tsx`
- Create: `src/renderer/components/ui/InlineNotice.tsx`
- Create: `src/renderer/components/ui/EmptyState.tsx`
- Create: `src/renderer/components/ui/ConfirmDialog.tsx`
- Modify: `src/renderer/components/MetricCard.tsx`
- Modify: `src/renderer/components/DataTable.tsx`
- Create: `tests/renderer/ui-components.test.tsx`

**Interfaces:**
- Produces: `IconName` and `AppIcon({ name, size?, decorative?, label? })`
- Produces: `ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>` with `variant: 'primary' | 'secondary' | 'ghost' | 'danger'`, `icon?: IconName`, and `busy?: boolean`
- Produces: `PageHeader({ eyebrow, title, description?, actions?, titleId })`
- Produces: `Field({ label, htmlFor, hint?, error?, required?, children })`
- Produces: `Panel({ title?, meta?, actions?, children, className? })`
- Produces: `StatusBadge({ tone: 'success' | 'warning' | 'danger' | 'neutral', icon?, children })`
- Produces: `InlineNotice({ tone, title, children?, action?, role? })` and `EmptyState({ icon, title, description, actions? })`
- Produces: `ConfirmDialog({ open, title, description, confirmLabel, cancelLabel?, variant?, busy?, onConfirm, onCancel, children? })`
- Preserves: existing `DataTable<Row>` props; adds `className?: string`
- Extends: `MetricCard` with `detail?`, `comparison?`, and `tone: 'default' | 'warning' | 'positive'`

- [ ] **Step 1: Write failing primitive tests**

Add tests named `renders button variants with accessible icons`, `connects field errors to controls`, `labels metric and table edge values`, and `traps and restores focus in confirm dialog`. Assert exact visible labels, `aria-describedby`, `aria-invalid`, `role="dialog"`, initial cancel-button focus for a destructive dialog, Escape cancellation, restored trigger focus, `₱9,999,999.99`, `0 pc`, and `−2 pc`.

- [ ] **Step 2: Run the primitive tests and verify failure**

Run: `npm test -- tests/renderer/ui-components.test.tsx`

Expected: FAIL because the `components/ui` modules do not exist.

- [ ] **Step 3: Install the bundled icon dependency**

Run: `npm install lucide-react`

Expected: `package.json` and `package-lock.json` include `lucide-react`; no other package versions change unexpectedly.

- [ ] **Step 4: Implement the component interfaces and root tokens**

Use the exact palette, local font stacks, focus behavior, reduced-motion rule, and control states from the spec. `ConfirmDialog` uses a native React portal or in-tree fixed overlay, focuses Cancel for destructive dialogs, handles Escape as cancel, and restores the previously focused element on close.

- [ ] **Step 5: Run component tests**

Run: `npm test -- tests/renderer/ui-components.test.tsx`

Expected: PASS.

- [ ] **Step 6: Run static checks**

Run: `npm run typecheck && npm run lint`

Expected: both commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/renderer/styles.css src/renderer/components tests/renderer/ui-components.test.tsx
git commit -m "feat: add renderer design system"
```

### Task 2: Shared Application Shell and Navigation

**Files:**
- Modify: `src/renderer/components/AppShell.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`
- Create: `tests/renderer/app-shell.test.tsx`
- Modify: `tests/renderer/dashboard.test.tsx`

**Interfaces:**
- Consumes: `AppIcon`, `Button`, and design tokens from Task 1
- Preserves: `AppShell` props and internal view identifiers, including `Dashboard`
- Produces: `navigationGroups: Array<{ label: string; items: Array<{ label: string; view: string; icon: IconName }> }>`
- Produces: visible label `Overview` mapped to view identifier `Dashboard`

- [ ] **Step 1: Write failing shell tests**

Add tests named `groups navigation by operator job`, `maps Overview to the Dashboard view`, `keeps global context accessible`, and `handles long context labels`. Assert group labels `Today`, `Stock operations`, and `Review`; `aria-current="page"`; accessible `Current location`, `Global business date`, and `New sale`; and preservation of a 120-character location name through selection and navigation.

- [ ] **Step 2: Run the shell tests and verify failure**

Run: `npm test -- tests/renderer/app-shell.test.tsx tests/renderer/dashboard.test.tsx`

Expected: FAIL because the grouped navigation and Overview label are absent.

- [ ] **Step 3: Implement the shell**

Replace the flat navigation arrays with `navigationGroups`, add local icons, retain `onNavigate(view)`, include Import data in Review, and keep Settings near the rail footer. Style the dark rail, turmeric brand tile, compact context bar, collapsed medium state, and print suppression.

- [ ] **Step 4: Update shared-context expectations**

Change only visible-label assertions affected by `Dashboard` → `Overview`; keep the existing location/date state persistence assertions intact.

- [ ] **Step 5: Run shell and dashboard tests**

Run: `npm test -- tests/renderer/app-shell.test.tsx tests/renderer/dashboard.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/AppShell.tsx src/renderer/styles.css tests/renderer/app-shell.test.tsx tests/renderer/dashboard.test.tsx
git commit -m "feat: redesign application shell"
```

### Task 3: Overview and Reports

**Files:**
- Modify: `src/renderer/pages/DashboardPage.tsx`
- Modify: `src/renderer/pages/ReportsPage.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `tests/renderer/dashboard.test.tsx`

**Interfaces:**
- Consumes: `PageHeader`, `Button`, `Panel`, `MetricCard`, `StatusBadge`, `InlineNotice`, `EmptyState`, and `DataTable`
- Preserves: `DashboardPage` and `ReportsPage` public props
- Produces: `DashboardActivityItem = { id: string; kind: 'sale' | 'movement'; occurredAt: string; title: string; detail: string }`, derived from `listSales({ locationId, limit: 4 })` and `getMovementHistory({ locationId, limit: 4 })`
- Produces: local `ReportKind = 'profit' | 'sales' | 'movements' | 'valuation' | 'discrepancies' | 'low-stock'`
- Produces: report-kind selection that renders only the relevant metrics, note, and table while preserving CSV export values

- [ ] **Step 1: Write failing Overview tests**

Update the dashboard test to expect `Today at a glance`, four primary metrics, one actionable low-stock/discrepancy notice when counts are nonzero, explicit `Low stock` text on affected rows, and `0` values without warning styling when both counts are zero. Stub recent sales and movements, then assert the four newest merged entries appear in descending Manila-local time. Retain the existing empty-state navigation tests.

- [ ] **Step 2: Write failing Reports tests**

Add assertions that selecting `Stock valuation` shows only valuation content, selecting `Discrepancies` shows signed variance values including `−2 pc`, export receives the selected `ReportKind`, large peso values render with grouping, and print still invokes `window.print()`.

- [ ] **Step 3: Run the report tests and verify failure**

Run: `npm test -- tests/renderer/dashboard.test.tsx`

Expected: FAIL on the new heading, attention notice, and focused report view.

- [ ] **Step 4: Implement Overview and focused Reports**

Derive all summary values from existing dashboard/report responses. Build the recent-activity feed by merging existing `listSales` and `getMovementHistory` results; do not add a service contract. Keep all six report requests batched as today, but render only the selected report and its relevant metric subset.

- [ ] **Step 5: Run report tests and static checks**

Run: `npm test -- tests/renderer/dashboard.test.tsx && npm run typecheck && npm run lint`

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/DashboardPage.tsx src/renderer/pages/ReportsPage.tsx src/renderer/styles.css tests/renderer/dashboard.test.tsx
git commit -m "feat: redesign overview and reports"
```

### Task 4: Fast Checkout, Receipt, and Sales History

**Files:**
- Modify: `src/renderer/components/SaleComposer.tsx`
- Modify: `src/renderer/components/SaleReceipt.tsx`
- Modify: `src/renderer/pages/SalesPage.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `tests/renderer/sale-composer.test.tsx`

**Interfaces:**
- Consumes: Task 1 primitives
- Preserves: `SaleComposer` and `SaleReceipt` public props and all exact arithmetic helpers
- Produces: local product result tiles showing name, SKU, formatted price, and formatted availability
- Produces: `ConfirmDialog`-based void flow with required reason inside the dialog

- [ ] **Step 1: Write failing checkout-layout tests**

Extend tests to assert product results expose availability before selection; the current-order summary exposes items, total, tendered, and change; zero-priced or over-availability lines display a specific message; and API failure retains search, lines, tendered amount, and note.

- [ ] **Step 2: Write failing receipt-dialog tests**

Replace `window.confirm` expectations with dialog assertions: focus starts on `Confirm void`, Escape returns focus to `Void sale`, cancellation never calls `onVoid`, and confirmation remains disabled until a nonblank reason is entered.

- [ ] **Step 3: Run the sales tests and verify failure**

Run: `npm test -- tests/renderer/sale-composer.test.tsx`

Expected: FAIL on product availability tiles, revised summary labels, and accessible dialog behavior.

- [ ] **Step 4: Implement the checkout and receipt design**

Keep product discovery and order lines in the left workflow region and the sticky checkout summary on the right at wide widths. Preserve separate source lines, exact pack/piece arithmetic, receipt data, sale refresh, and void restocking behavior.

- [ ] **Step 5: Run sales tests and static checks**

Run: `npm test -- tests/renderer/sale-composer.test.tsx && npm run typecheck && npm run lint`

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/SaleComposer.tsx src/renderer/components/SaleReceipt.tsx src/renderer/pages/SalesPage.tsx src/renderer/styles.css tests/renderer/sale-composer.test.tsx
git commit -m "feat: streamline sales checkout"
```

### Task 5: Inventory and Stock Operations

**Files:**
- Modify: `src/renderer/pages/InventoryPage.tsx`
- Modify: `src/renderer/pages/ReplenishPage.tsx`
- Modify: `src/renderer/pages/TransfersPage.tsx`
- Modify: `src/renderer/pages/StockCountPage.tsx`
- Modify: `src/renderer/pages/stock-shared.tsx`
- Modify: `src/renderer/styles.css`
- Create: `tests/renderer/inventory-page.test.tsx`
- Modify: `tests/renderer/stock-workflows.test.tsx`

**Interfaces:**
- Consumes: Task 1 primitives
- Extends: `InventoryPage` with optional `onNavigate?: (page: string) => void`
- Preserves: other stock-page props and `LocationSelect` / `ProductSelect` signatures
- Produces: inventory `search` and `statusFilter: 'all' | 'low'`
- Produces: stock-operation summaries that preview resulting balances using already loaded product/balance data

- [ ] **Step 1: Write failing inventory tests**

Add tests for product/SKU search, All/Low stock filtering, explicit healthy/low labels, zero stock, pack equivalents, stock value, and header actions calling `onNavigate('Replenish')` and `onNavigate('Stock count')`.

- [ ] **Step 2: Extend failing workflow tests**

Assert replenishment previews resulting on-hand balance; transfer previews both source and destination balances and rejects equal locations; stock count shows signed difference and value impact; and each API rejection preserves entered quantity, unit, and note/reason with `role="alert"`.

- [ ] **Step 3: Run stock tests and verify failure**

Run: `npm test -- tests/renderer/inventory-page.test.tsx tests/renderer/stock-workflows.test.tsx`

Expected: FAIL on filters, navigation actions, resulting balances, and value impact.

- [ ] **Step 4: Implement the Inventory page**

Use `DataTable`, `StatusBadge`, and existing balance/product data. Update `App.tsx` to pass `onNavigate={setView}`. Keep movement history below the primary inventory table.

- [ ] **Step 5: Implement stock workflow summaries**

Keep current API payloads unchanged. Calculate display-only previews with `toPieces`, existing balances, product pack sizes, and current purchase cost; do not duplicate service validation.

- [ ] **Step 6: Run stock tests and static checks**

Run: `npm test -- tests/renderer/inventory-page.test.tsx tests/renderer/stock-workflows.test.tsx && npm run typecheck && npm run lint`

Expected: all commands pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/App.tsx src/renderer/pages/InventoryPage.tsx src/renderer/pages/ReplenishPage.tsx src/renderer/pages/TransfersPage.tsx src/renderer/pages/StockCountPage.tsx src/renderer/pages/stock-shared.tsx src/renderer/styles.css tests/renderer/inventory-page.test.tsx tests/renderer/stock-workflows.test.tsx
git commit -m "feat: improve inventory workflows"
```

### Task 6: Products, Locations, and Settings

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/pages/ProductsPage.tsx`
- Modify: `src/renderer/pages/LocationsPage.tsx`
- Modify: `src/renderer/pages/SettingsPage.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `tests/renderer/products-page.test.tsx`
- Create: `tests/renderer/locations-page.test.tsx`
- Modify: `tests/renderer/settings-page.test.tsx`

**Interfaces:**
- Consumes: Task 1 primitives and `formatMoney`
- Preserves: Products and Settings page props and all existing `InventoryApi` signatures
- Extends: `LocationsPage({ api?, activeLocationId? })` so the current global location can be labeled without creating new state
- Produces: product `search` and `visibilityFilter: 'active' | 'archived'`, backed by `listProducts({ includeArchived: true })`
- Produces: `LocationSummary = { location: CatalogLocation; totalPieces: number; productCount: number }`, derived with existing `getBalances(location.id)` calls
- Produces: `ConfirmDialog` archive flows and restore flow
- Produces: Settings sections for Business profile, Backups, Restore, Import data, and About
- Produces: session-local `lastBackupFile` from the existing `createManualBackup()` result so the latest successful backup is visible without changing `InventoryApi`

- [ ] **Step 1: Write failing Products tests**

Assert search and Active/Archived filtering, peso-denominated form labels and values, preservation of exact centavos in `saveProduct`, accessible long product names, and archive confirmation/cancellation through `ConfirmDialog`.

- [ ] **Step 2: Write failing Locations tests**

Assert add/edit focus, current-location labeling, per-location product/piece totals, long location-name display, archive confirmation/cancellation, retained history explanation, and API failure text that leaves the edited name in place.

- [ ] **Step 3: Extend failing Settings tests**

Assert the five section headings, visible backup directory, last-operation status, startup-warning recovery action, long backup filename within the restore dialog, Escape cancellation/focus restoration, and unchanged restore/relaunch behavior.

- [ ] **Step 4: Run catalog/settings tests and verify failure**

Run: `npm test -- tests/renderer/products-page.test.tsx tests/renderer/locations-page.test.tsx tests/renderer/settings-page.test.tsx`

Expected: FAIL on filters, peso fields, section structure, and custom confirmations.

- [ ] **Step 5: Implement the three page redesigns**

Convert displayed price inputs between pesos and centavos at the UI boundary while submitting integer centavos. Use dialogs or focused panels for add/edit, keep archive/restore visually separate, and preserve all existing service calls and error messages where they are already specific.

- [ ] **Step 6: Run catalog/settings tests and static checks**

Run: `npm test -- tests/renderer/products-page.test.tsx tests/renderer/locations-page.test.tsx tests/renderer/settings-page.test.tsx && npm run typecheck && npm run lint`

Expected: all commands pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/App.tsx src/renderer/pages/ProductsPage.tsx src/renderer/pages/LocationsPage.tsx src/renderer/pages/SettingsPage.tsx src/renderer/styles.css tests/renderer/products-page.test.tsx tests/renderer/locations-page.test.tsx tests/renderer/settings-page.test.tsx
git commit -m "feat: redesign catalog and settings"
```

### Task 7: First-run Setup and CSV Import

**Files:**
- Modify: `src/renderer/pages/SetupPage.tsx`
- Modify: `src/renderer/pages/ImportPage.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `tests/renderer/setup-page.test.tsx`
- Modify: `tests/renderer/import-page.test.tsx`

**Interfaces:**
- Consumes: Task 1 primitives
- Preserves: `SetupPage` and `ImportPage` props and every existing API payload
- Produces: `SetupStep = 0 | 1 | 2` and visual step descriptors with current/completed state
- Preserves: Import stages 1–4 and existing `ImportKind` / mapping logic

- [ ] **Step 1: Write failing Setup tests**

Assert all three labeled steps, current/completed step semantics, retained business/location values after Back, offline/local-storage explanation, exact CSV-import branch, and recoverable submit errors that preserve entered opening stock.

- [ ] **Step 2: Extend failing Import tests**

Assert current/completed stage semantics, supported import descriptions before file selection, required/optional mapping labels, separated file-level and row-level issues, disabled commit until validation passes, and unchanged aggregate completion copy.

- [ ] **Step 3: Run setup/import tests and verify failure**

Run: `npm test -- tests/renderer/setup-page.test.tsx tests/renderer/import-page.test.tsx`

Expected: FAIL on new progress semantics and explanatory copy.

- [ ] **Step 4: Implement Setup and Import redesigns**

Use the focused setup layout only before `AppShell` mounts. Use the normal shell for Import. Preserve state across Back actions, existing validation, exact imported-row accounting, and `onComplete` routing.

- [ ] **Step 5: Run setup/import tests and static checks**

Run: `npm test -- tests/renderer/setup-page.test.tsx tests/renderer/import-page.test.tsx && npm run typecheck && npm run lint`

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/SetupPage.tsx src/renderer/pages/ImportPage.tsx src/renderer/styles.css tests/renderer/setup-page.test.tsx tests/renderer/import-page.test.tsx
git commit -m "feat: polish setup and import flows"
```

### Task 8: Responsive, Accessibility, and End-to-End Verification

**Files:**
- Modify: `src/renderer/styles.css`
- Modify: `tests/e2e/app.spec.ts`
- Modify: `docs/acceptance-checklist.md`

**Interfaces:**
- Consumes: all renderer work from Tasks 1–7
- Produces: verified breakpoints at 1280px, 980px, and 760px viewport widths
- Produces: final acceptance criteria for keyboard, reduced motion, print, and long-content behavior

- [ ] **Step 1: Extend the end-to-end test with the redesigned labels**

Keep the existing setup → product → location → sale → transfer → count → reports → restart → void → backup flow. Update only labels intentionally changed by the redesign.

- [ ] **Step 2: Add failing responsive and long-content assertions**

At 760px viewport width, visit Overview, New sale, Inventory, Reports, Products, Settings, and Import data; assert the page heading and primary action are visible, the navigation remains operable, and `document.documentElement.scrollWidth === document.documentElement.clientWidth`. Seed or enter long business, product, location, and backup names and assert their accessible full values remain available.

- [ ] **Step 3: Add keyboard and dialog assertions**

Use Tab/Shift+Tab to reach global navigation and the page primary action. Open a destructive dialog, assert focus remains within it, press Escape, and assert focus returns to the trigger without invoking the operation.

- [ ] **Step 4: Run the packaged end-to-end test and verify failure**

Run: `npm run test:e2e`

Expected: FAIL until final responsive selectors, overflow containment, and labels are complete.

- [ ] **Step 5: Finish responsive, print, and reduced-motion styles**

Fix only issues demonstrated by the assertions. Confirm the wide rail, medium icon rail, narrow stacked workflows, contained data tables, print suppression, and reduced-motion behavior match the spec.

- [ ] **Step 6: Update the acceptance checklist**

Add explicit checks for the three widths, keyboard-only navigation, dialogs, status labels, long content, report printing, and offline asset loading.

- [ ] **Step 7: Run the complete verification suite**

Run: `npm test && npm run typecheck && npm run lint && npm run test:e2e && npm run package && node scripts/check-package.mjs`

Expected: every command exits 0; package check confirms a launchable offline desktop bundle.

- [ ] **Step 8: Perform visual verification**

Capture Overview, New sale, Inventory, Reports, Settings, Import, and Setup at 1280px; repeat the highest-density pages at 980px and 760px. Compare hierarchy, spacing, palette, navigation, summaries, and status treatments with the approved mock. Record any intentional deviations in `docs/acceptance-checklist.md`.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/styles.css tests/e2e/app.spec.ts docs/acceptance-checklist.md
git commit -m "test: verify redesigned desktop experience"
```

## Final Review

- [ ] Confirm every requirement in the design spec maps to Tasks 1–8.
- [ ] Confirm no database, main-process service, or shared contract changed.
- [ ] Review the final branch diff for accidental behavior changes and remote asset references.
- [ ] Run a whole-branch code review with special attention to exact money calculations, focus restoration, narrow-window overflow, and destructive actions.
