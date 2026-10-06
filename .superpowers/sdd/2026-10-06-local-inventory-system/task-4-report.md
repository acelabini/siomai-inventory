# Task 4 report: inventory ledger workflows

## Outcome

Implemented opening stock, replenishments with purchase-cost snapshots, atomic transfers, stock counts, current balances, and movement history. Each service write uses one immediate SQLite transaction; each signed movement delta is applied to `inventory_balances` in that transaction. Database triggers prevent stock movement updates and deletes.

Added the Inventory, Replenish, Transfers, and Stock count screens and connected them through the validated IPC/preload API. Replenishment supports multiple products, pack/piece conversions, availability, PHP cost summaries, and success reset. Transfer and count forms validate locations, stock, discrepancy reason, and show confirmation summaries.

## RED/GREEN evidence

- Ledger RED: `npx --yes --package=node@22.23.3 node "$(command -v npm)" test -- tests/integration/inventory-service.test.ts` failed because `src/main/services/inventory-service` was missing (Vitest reported 0 tests loaded).
- Ledger GREEN: the same focused run passed all 6 ledger tests after implementation.
- Workflow RED: `npx --yes --package=node@22.23.3 node "$(command -v npm)" test -- tests/renderer/stock-workflows.test.tsx` failed because `InventoryPage` was missing (Vite could not resolve the import).
- Workflow GREEN: focused workflows passed all 4 tests after implementation.
- Follow-up RED: a zero-quantity opening-stock test failed because a second zero opening was accepted. Persisting a unique opening record made the test pass.
- Follow-up RED: a transfer receipt test failed because its ID had no persisted batch row. Transfer batches now persist and group the product transfer rows and movements; the focused ledger suite passed afterward.
- First combined implementation run exposed four ledger fixture mistakes (catalog sort order and querying the wrong movement row); corrected the fixture to select stable product IDs and query the relevant product. The transfer UI test also initially queried a non-unique option; it now selects the destination field directly.

### Review round 1 fixes

- RED — `converts UTC movement timestamps to Manila local time`: `npx --yes --package=node@22.23.3 node "$(command -v npm)" test -- tests/renderer/stock-workflows.test.tsx -t "converts UTC movement timestamps to Manila local time"` failed because the UTC timestamp was rendered raw. For the fixture `2026-10-06 16:30:00` UTC, the hand-derived Manila display is `Oct 7, 2026, 12:30 AM`.
- GREEN — the same focused test passed after movement timestamps were parsed as UTC and formatted explicitly with `Asia/Manila` at render time.
- RED — `marks setup-created zero opening quantities as already recorded without zero movements`: `npx --yes --package=node@22.23.3 node "$(command -v npm)" test -- tests/integration/inventory-service.test.ts -t "marks setup-created zero opening quantities as already recorded without zero movements"` failed because setup had no opening-stock records for zero balances (`expected 2n, received 0n`).
- GREEN — the same focused test passed after setup records each selected product’s opening quantity, including zero, without appending an invalid zero movement.
- Covering GREEN — `npx --yes --package=node@22.23.3 node "$(command -v npm)" test -- tests/integration/inventory-service.test.ts tests/renderer/stock-workflows.test.tsx` passed 12 tests across both files.

## Verification

- `npx --yes --package=node@22.23.3 node "$(command -v npm)" test -- tests/integration/inventory-service.test.ts tests/renderer/stock-workflows.test.tsx` — passed, 12 tests.
- `npx --yes --package=node@22.23.3 node "$(command -v npm)" test` — passed, 54 tests across 8 files.
- `npx --yes --package=node@22.23.3 node "$(command -v npm)" run typecheck` — passed.
- `npx --yes --package=node@22.23.3 node "$(command -v npm)" run lint` — passed with zero warnings.

## Files

- Added `src/main/services/inventory-service.ts` and inventory schemas/contracts.
- Added migration v2 for replenishment cost snapshots, opening stock records, transfer batches, cost columns, and immutable movement triggers.
- Wired inventory operations into IPC, preload, and Electron startup.
- Added four stock workflow pages and shared stock selectors/formatters; routed the app navigation and applied matching styles.
- Added ledger integration tests, workflow component tests, and updated migration assertions.

## Self-review and concerns

- All balance writes are performed after checking the existing balance and within the same immediate transaction as the movement insert. Multi-line transfer failure rolls back both locations and prior lines.
- Count expected quantities are read from the database inside the transaction, never trusted from the renderer. A non-zero difference requires a reason.
- Replenishment costs are snapshotted in both replenishment line records and their ledger movement rows; cost is rounded to the nearest centavo for partial-piece quantities.
- Transfer and stock-count forms currently edit one product at a time. Their service APIs accept multiple lines, and replenishment already has a multi-line editor.
- The worktree had pre-existing edits in `.gitignore` and `docs/superpowers/{plans,specs}`. These were left untouched and excluded from the Task 4 commit. A global `git diff --check` reported CRLF trailing-space warnings in those unrelated pre-existing files; no Task 4 file warnings were observed.

## Commit

Initial Task 4 commit: `aa14be4` (`feat: add stock ledger workflows`). Review round 1 fix: `b27583a` (`fix: mark zero setup stock and localize movements`).
