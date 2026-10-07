# SDD ledger — plan: docs/superpowers/plans/2026-10-06-local-inventory-system.md

## Preflight

Spec: `docs/superpowers/specs/2026-10-06-local-inventory-system-design.md` (reachable)
Branch start: `4dd29ba`
Workspace: `//wsl.localhost/Ubuntu-22.04/home/ubuntu/Dev/siomai/.worktrees/inventory-desktop`

### Task self-consistency scan

| Task | Tests vs implementation | Files/interfaces | Result |
|---|---|---|---|
| 1 | Security behavior is tested before window implementation | Creates the shared bridge and build foundation used later | Clean after ruling R1 |
| 2 | Quantity, money, and migration tests map to named helpers | Creates database and value interfaces consumed by Tasks 3–8 | Clean |
| 3 | Catalog and setup tests map to service, IPC, and pages | Extends the Task 1 bridge and consumes Task 2 database | Clean |
| 4 | Ledger tests cover each named stock workflow | Extends catalog, contracts, IPC, preload, and pages coherently | Clean |
| 5 | Sales tests cover completion, oversell, snapshots, and voids | Uses Task 4 balance semantics and Task 2 value helpers | Clean |
| 6 | Report tests cover ledger/sales projections and dashboard UI | Consumes Tasks 3–5 and reshapes Task 1 shell | Clean |
| 7 | Import/export tests cover atomic validation and CSV safety | Consumes catalog/inventory/report contracts | Clean |
| 8 | Backup tests cover validation and non-destructive restore | Consumes database lifecycle and adds startup orchestration | Clean |
| 9 | E2E and package checks cover the assembled app | Consumes every prior task and completes distribution docs | Clean after ruling R2 |

### Shared file and interface scan

| Tasks | Producer → consumer/shared surface | Result |
|---|---|---|
| 1 → 2 | Build/test foundation → database and domain modules | Compatible |
| 1 → 3 | `contracts.ts`, `main.ts`, `preload.ts`, React shell → catalog APIs and setup pages | Compatible |
| 1 → 4 | Typed bridge foundation → inventory API extensions | Compatible |
| 1 → 5 | Typed bridge foundation → sales API extensions | Compatible |
| 1 → 6 | `App.tsx` and `styles.css` → application shell/dashboard | Compatible; Task 6 owns visual completion |
| 1 → 7 | Typed bridge foundation → import/export API extensions | Compatible |
| 1 → 8 | `main.ts` and typed bridge → backup startup/API extensions | Compatible |
| 1 → 9 | `forge.config.ts` → final packaging/signing configuration | Compatible |
| 2 → 3 | Migrated catalog tables → `CatalogService` | Compatible |
| 2 → 4 | Migrations and `toPieces` → ledger operations | Compatible |
| 2 → 5 | Money/quantity helpers and schema → sales snapshots | Compatible |
| 2 → 6 | Integer money and timestamps → report projections | Compatible |
| 2 → 7 | Database/value helpers → import normalization | Compatible |
| 2 → 8 | Database migration/version → backup validation | Compatible |
| 3 → 4 | Catalog IDs, schemas, IPC, preload → stock workflows | Compatible |
| 3 → 5 | Product/location DTOs and IPC → checkout | Compatible |
| 3 → 6 | Catalog filters and renderer pages → reports/shell | Compatible |
| 3 → 7 | Catalog service and setup UI → import mapping | Compatible |
| 3 → 8 | Settings/catalog lifecycle and IPC → settings/backup page | Compatible |
| 4 → 5 | Balance and immutable movement semantics → sales deductions/reversals | Compatible |
| 4 → 6 | Ledger and balances → dashboard/report queries | Compatible |
| 4 → 7 | Opening/replenishment semantics → imported stock movements | Compatible |
| 4 → 8 | SQLite transactional state → consistent backups | Compatible |
| 5 → 6 | Sale status and snapshots → revenue/profit reports | Compatible |
| 5 → 7 | Sales remain absent from aggregate imports → import rules | Compatible |
| 5 → 9 | Sale UI/service → end-to-end smoke workflow | Compatible |
| 6 → 7 | Report DTOs/page → CSV export | Compatible |
| 6 → 8 | App shell/settings route → backup UI | Compatible |
| 6 → 9 | Completed navigation/dashboard → E2E and docs | Compatible |
| 7 → 8 | Import operation → required pre-import backup/operation lock | Compatible; Task 8 must wrap Task 7 commit |
| 7 → 9 | Import/export workflows → E2E, templates, and user guide | Compatible |
| 8 → 9 | Backup/restore/settings → E2E and recovery documentation | Compatible |

Ruling R1: Task 1 may install/configure the test runner and build scaffolding before RED because generated/configuration setup is the prerequisite for executing a test; no application behavior may be implemented until the security test fails for the expected missing behavior — cost if wrong: the initial foundation will not satisfy strict test-first ordering.

Ruling R2: This Windows/WSL session will implement and verify source, tests, local packaging where supported, and the macOS release workflow; signed/notarized universal DMG acceptance remains mandatory on a macOS runner with client-owned Apple credentials — cost if wrong: the repository can be complete while the client installer itself is not yet distributable.

Ruling R3: Task 8 owns the cross-service operation lock and pre-import backup wrapper around Task 7's commit API; Task 7 exposes a commit core that Task 8 composes rather than duplicating import logic — cost if wrong: imports could run without the mandated safety backup until Task 8 lands.

Ruling R4: The sample catalog uses the screenshot's five product names, pieces-per-pack, and inferred purchase costs (`₱146`, `₱140`, `₱95`, `₱110`, `₱148` per pack); selling prices remain zero and setup must direct the operator to enter them before sales are allowed, because the screenshot contains no selling-price evidence — cost if wrong: initial onboarding requires one extra pricing step.

Task 1: dispatched to `/root/task_1_foundation` at base `4dd29ba` using `gpt-6-luna` high.
Task 1: minor (deferred): the CSP test checks required and selected forbidden directives but does not exhaustively reject every permissive directive.
Task 1: fix round 1/5 opened — use Forge's compile-time Vite globals so `npm start` loads the development renderer; covering test: `tests/unit/security-config.test.ts`.
Task 1: fix round 1/5 (1 addressed, 0 open; commits `df766b0..dd96bb3`).
Task 1: complete (commits `4dd29ba..dd96bb3`, review clean). Controller verification: 3/3 tests, typecheck, and lint passed on Node 22.23.3.
Task 2: dispatched to `/root/task_2_database` at base `dd96bb3` using `gpt-6-luna` high.
Task 2: fix round 1/5 opened — enforce integer storage for every persisted piece quantity, pack size, threshold, and centavo field at the SQLite boundary; covering test: `tests/integration/migrations.test.ts`.
Task 2: fix round 1/5 (1 addressed, 0 open; commits `bdb99db..535d18e`).
Task 2: complete (commits `dd96bb3..535d18e`, review clean). Controller verification: 33/33 tests, typecheck, and lint passed on Node 22.23.3.
Task 3: dispatched to `/root/task_3_catalog` at base `535d18e` using `gpt-6-luna` high.
Task 3: complete (commits `535d18e..e642f4f`, review clean). Controller verification: 42/42 tests, typecheck, and lint passed on Node 22.23.3.
Task 4: dispatched to `/root/task_4_inventory` at base `e642f4f` using `gpt-6-luna` high.
Task 4: fix round 1/5 opened — (1) format stored UTC movement timestamps for Asia/Manila display, and (2) make setup-created zero balances count as consumed opening-stock records; covering tests: `tests/renderer/stock-workflows.test.tsx`, `tests/integration/inventory-service.test.ts`, and catalog setup integration where appropriate.
Task 4: fix round 1/5 (2 addressed, 0 open; commits `aa14be4..7bf4abe`).
Task 4: complete (commits `e642f4f..7bf4abe`, review clean). Controller verification: 54/54 tests, typecheck, and lint passed on Node 22.23.3.
Task 5: dispatched to `/root/task_5_sales` at base `7bf4abe` using `gpt-6-luna` high.
Task 5: fix round 1/5 opened — preserve every source sale line's entered unit, quantity, selling price, and cost snapshot; consolidate duplicate products only for availability checks, stock movement, and cached balance deduction. Keep UI snapshot copy accurate. Covering test: `tests/integration/sales-service.test.ts` plus renderer copy if changed.
Task 5: minor (deferred): repeated entries for the same product have identical legends and remove labels, making them harder to distinguish visually.
Task 5: minor (deferred): fix report describes removing a prior unique sale-line constraint that is not visible in the preceding repository migration; behavior is sound but migration rationale is imprecise.
Task 5: fix round 1/5 (2 addressed, 0 open; commits `2f33ae8..ae83f1d`).
Task 5: complete (commits `7bf4abe..ae83f1d`, review clean with 2 deferred minors). Controller verification: 70/70 tests, typecheck, and lint passed on Node 22.23.3.
Task 6: dispatched to `/root/task_6_reports` at base `ae83f1d` using `gpt-6-luna` high.
Task 6: minor (deferred): historical stock valuation uses current catalog purchase cost because version 1 defines no FIFO/weighted-average policy or opening-cost snapshots; document the limitation.
Task 6: minor (deferred): the daily ribbon does not separately expose transfer-outs, count adjustments, or sale-void restocks, so its four categories are explanatory rather than a strict reconciliation equation.
Task 6: fix round 1/5 opened — make sidebar/topbar persistent with meaningful active location/date controls, and render accessible detail tables for valuation, discrepancy, and low-stock report datasets. Cover with `tests/renderer/dashboard.test.tsx`.
Task 6: fix round 1/5 (1 addressed, 1 open — report detail tables fixed; top context remains unsynchronized with workflow pages; commits `ec8356f..05c7cb0`).
Task 6: fix round 2/5 opened — make App-owned active location the single source of truth for Sales, Inventory, Replenishment, Transfers source, Stock Count, Dashboard, and Reports; prevent any workflow selector from disagreeing with the top bar.
Task 6: fix round 2/5 (1 addressed, 0 open; commits `05c7cb0..c31e06c`).
Task 6: complete (commits `ae83f1d..c31e06c`, review clean with 2 deferred minors). Controller verification: 77/77 tests, typecheck, and lint passed on Node 22.23.3.
Task 7: dispatched to `/root/task_7_csv` at base `c31e06c` using `gpt-6-luna` high.
Task 7: original agent interrupted by usage limit after service tests reached 6/6; partial uncommitted work preserved. Fresh continuation implementer dispatched against the same brief and working tree.
Task 7: fix round 1/5 opened — reject duplicate resolved products during preview, accept opening-stock mapping with either SKU or name, and include parser/header failures in invalid-row counts. Cover services and ImportPage with regression tests.
Task 7: fix round 1/5 (2 addressed, 1 open — malformed data-row parser errors are counted as file issues but not displayed or counted as invalid rows; commits `2202a07..083cd18`).
Task 7: fix round 2/5 opened — classify and display parser errors by actual row, include blocking row errors in invalidRows, and keep file/header issues separate; also attach duplicate product-file SKU errors to their rows so counts remain truthful.
Task 7: fix round 2/5 (duplicate-SKU counting addressed; parser visibility addressed but duplicate messages remain; commits `083cd18..b9c7c56`).
Task 7: fix round 3/5 opened — emit one malformed-after-quote parser error per field/row rather than one per trailing character, with exact-count regression.
Task 7: fix round 3/5 (1 addressed, 0 open; commits `b9c7c56..d64d07f`).
Task 7: complete (commits `c31e06c..d64d07f`, review clean). Controller verification: 97/97 tests, typecheck, and lint passed on Node 22.23.3.
Task 8: dispatched to `/root/task_8_backup` at base `d64d07f` using `gpt-6-luna` high.
Task 8: fix round 1/5 opened — validate the complete application schema, replace live DB crash-atomically, keep a recoverable UI available when startup backups fail, and bind restore to a one-time native-picker selection plus main-process confirmation. Add adversarial integration/IPC/startup tests.
Task 8: fix round 1/5 complete — full SQLite schema fingerprint validation rejects incomplete compatible-looking files; staged same-directory atomic rename preserves the open original on injected replacement failure; safety backups fall back to userData/recovery-backups and block migration if unavailable; automatic-backup startup failure now reaches Settings with a warning; picker paths are held behind consumed one-time tokens and native confirmation. RED/GREEN evidence and full verification are in task-8-report.md. Verification: 20 files/123 tests, typecheck, lint, and diff-check passed on Node 22.23.3.
Task 8: fix round 2/5 complete — CSV report export now performs its report read under the shared operation lock and rejects after restore commits, preventing stale-inode CSV reads before relaunch. Added a regression test and audited bespoke IPC handlers. Verification: focused IPC 3/3; full suite 20 files/124 tests; typecheck, lint, and diff-check passed on Node 22.23.3. Details in task-8-report.md.
Task 8 complete at `7695a38` after 2 fix rounds; focused rereview PASS; controller full verification 20 files/124 tests, typecheck, lint, diff-check passed.
Ruling R5: all Node 22 verification commands must prepend the Node 22 binary directory to PATH for the entire npm/Vitest process tree; invoking npm through Node 22 alone allowed child workers to resolve Node 20 and caused WSL parallel native-module SIGSEGVs.
Ruling R6: Task 9 keeps E2E data and report destinations behind `!app.isPackaged && SIOMAI_E2E=1`; the E2E run still uses the real renderer, preload, IPC handlers, and SQLite services, while production retains native file dialogs and the Application Support database — cost if wrong: the automated report test does not verify the macOS save-dialog presentation itself.
Ruling R7: Task 9 keeps `better-sqlite3` external to the Vite main bundle and writes the renderer to `.vite/renderer/main_window`, matching the main-process packaged path; the first actual Electron launch showed the bundled native require and mismatched renderer output otherwise prevented window startup — cost if wrong: the native module or renderer would fail only after packaging.
Task 9: RED confirmed — initial command had no E2E script; after wiring, Electron closed before a window because the packaged native dependency could not resolve and renderer output path differed. First full flow also exposed insufficient transfer fixture stock; corrected with a valid 500-piece opening balance.
Task 9: GREEN — Playwright E2E passed across first-run setup, opening stock, piece and pack sales, transfer, count discrepancy, report CSV, restart/persistence, sale void, and manual backup in isolated userData. Final verification: 20 files/124 unit-integration-renderer tests, typecheck, lint, E2E, Linux package, package checker (11 ASAR entries), and `git diff --check` passed on Node 22.23.3/npm 10.9.4. See task-9-report.md.
Task 9: implementation and local verification complete; macOS universal DMG signing, notarization, stapling, Gatekeeper and Intel/Apple Silicon acceptance remain mandatory on macOS with client credentials, explicitly recorded in docs/acceptance-checklist.md.
Task 9 fix round 1/5: RED — added tests/release-workflow.test.ts; both assertions failed against the original workflow because certificate import followed Forge package steps and final universal output selection/checking was absent.
Ruling R8: release CI imports/unlocks the Developer ID keychain before any Forge packaging (including E2E's package step); after universal make, require exactly one `darwin-universal/Siomai Inventory.app`, run package checks against that app directly, and retain its exact app/DMG paths for notarization. Remove prior make outputs before generation so stale artifacts cannot be selected.
Task 9 fix round 1/5 GREEN — static workflow regression tests pass (2/2); full suite 21 files/126 tests, typecheck, lint, and E2E pass. Linux Forge package initially hit a Vite subprocess SIGSEGV after E2E; isolated package retry passed with Node 22.23.3/npm 10.9.4, package checker passed 11 ASAR entries, and `git diff --check` passed. A follow-up regression assertion caught unsupported Bash `mapfile` on macOS system Bash; universal app/DMG counting now uses Bash 3-compatible loops. macOS signing/universal output remains CI-only on this WSL host.
Task 9 fix round 2/5: RED — expanded release workflow tests failed on GNU-only base64 decoding and the absence of app notarization before stapling; an added guard also detected Forge's automatic notarization hook competing with workflow sequencing.
Ruling R9: import PKCS#12 using macOS `base64 -D`; do not use GNU `--decode` on the macOS release runner.
Ruling R10: Forge performs code signing only. CI submits a ZIP of the exact universal app and requires JSON status `Accepted`, staples/validates that app, recreates the final DMG from the stapled app, then submits the exact final DMG and requires `Accepted` before stapling/validating, signature/Gatekeeper/architecture checks, checksum, and upload.
Task 9 fix round 2/5 GREEN — focused workflow tests 5/5; full suite 21 files/129 tests; typecheck, lint, Electron E2E 1/1, Linux x64 package, package checker (11 ASAR entries), and `git diff --check` passed on Node 22.23.3/npm 10.9.4. macOS base64, Apple notarization, stapling, DMG creation, codesign/spctl remain macOS CI-only here.

Final whole-branch review fix wave at `b52dfa8`: addressed the eight supplied findings in shared centavo-safe pack pricing, CSV duplicate-name preview validation, editable low-stock thresholds, final DMG signing/verification, truthful stock-count dashboard copy, first-run CSV setup path, repeated-sale-line identity/accessibility, and activity-summary disclosure. See `final-fix-report.md` for RED/GREEN evidence and command results.
Ruling R11: the first-run CSV route commits the required business and active location with no sample products/opening movements, then navigates into Import; this keeps imports location-bound and avoids a partially completed setup state.
Ruling R12: final DMG signing uses the exact workflow-selected `$FINAL_DMG` path after `hdiutil create`; CI verifies that same signature before notarization and again after stapling before upload. Apple signing/notarization execution remains macOS-only.
Final fix rereview round 1 at `3af1f36`: RED — repeated-line renderer assertion failed because both unit selectors had the same accessible name (`Unit for Siomai Pork`). GREEN — unit selector names now include `Line 1` / `Line 2`, consistent with the displayed draft-line identity; focused SaleComposer tests pass 8/8. Full follow-up verification passed: 22 files / 138 tests, typecheck, lint, Electron E2E 1/1, Linux package, package checker (11 ASAR entries), and diff-check on Node 22.23.3/npm 10.9.4. Details in `final-fix-report.md`.
