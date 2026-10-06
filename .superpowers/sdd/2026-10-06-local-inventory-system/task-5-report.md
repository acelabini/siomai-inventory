# Task 5: Transaction-Level Sales and Reversals

## Outcome

Implemented transaction-level checkout, sales history, and void reversals using the existing local SQLite ledger and secure IPC pattern. Sale creation and reversal use immediate SQLite transactions, so a failed line rolls back the sale, movements, and cached balances together. Voids mark the sale once and add explicit positive `sale_void` movements tied to the original sale ID.

Zero prices are rejected for the selected selling unit. Payment, change, pack pricing, piece pricing, and fractional-pack revenue are handled in integer centavos; stock quantities are rechecked against the balance cache inside the transaction.

## RED/GREEN evidence

- Integration RED: `npm test -- tests/integration/sales-service.test.ts` initially failed at module resolution with `Cannot find module '../../src/main/services/sales-service'`, as expected before implementation.
- Integration GREEN: all 8 sales integration tests pass. They cover duplicate product consolidation across pack/piece units, historical snapshots, centavo rounding, payment/change, insufficient payment, zero price, stock failure and rollback, sequential last-stock attempts, and successful/idempotent voiding.
- Renderer RED: `npm test -- tests/renderer/sale-composer.test.tsx` initially failed to resolve the missing `SaleComposer` component, as expected before implementation.
- Focused GREEN: `npm test -- tests/integration/sales-service.test.ts tests/renderer/sale-composer.test.tsx --reporter=dot` passed 12 tests. The final full suite additionally passed the new fractional-pack centavo case.

The two initial GREEN iterations also exposed fixture mistakes in my first renderer/service test drafts (an underfunded sale and queries that didn't match the UI's labels); I corrected the fixtures and reran them until the intended behaviors passed.

## Final verification

Run in WSL with the requested Node runner:

- `npx --yes --package=node@22.23.3 node "$(command -v npm)" test` — passed: 10 files, 67 tests.
- `npx --yes --package=node@22.23.3 node "$(command -v npm)" run typecheck` — passed (`tsc --noEmit`).
- `npx --yes --package=node@22.23.3 node "$(command -v npm)" run lint` — passed (`eslint . --max-warnings=0`).

## Files changed

- Added `src/main/services/sales-service.ts` for atomic sale creation, history queries, and idempotent reversal.
- Extended `src/shared/schemas.ts` and `src/shared/contracts.ts` with validated sale inputs, receipts, summaries, and API methods.
- Wired sales error translation and completion/list/void endpoints through `src/main/ipc/register-handlers.ts`, `src/preload.ts`, and `src/main.ts`.
- Added `src/renderer/components/SaleComposer.tsx`, `SaleReceipt.tsx`, and `src/renderer/pages/SalesPage.tsx`; connected the page and New Sale action in `src/renderer/App.tsx`, with sale-specific styling in `src/renderer/styles.css`.
- Added `tests/integration/sales-service.test.ts` and `tests/renderer/sale-composer.test.tsx`; extended the shared renderer API test helper in `tests/renderer/stock-workflows.test.tsx`.

## Self-review and concerns

- Verified that failures from later sale lines leave no partial sales, lines, movements, or balance changes; void failures are also transaction-scoped, and a second void is rejected.
- Historical line revenue and cost are stored as integer snapshots and remain unchanged after catalog price/cost updates. For a single entered line, its selected price is saved directly. When duplicate product entries use mixed units, the existing `sale_lines` schema allows only one `unit_selling_price_centavos`; the implementation stores a consolidated effective unit-price snapshot while preserving the exact charged `line_revenue_centavos` and total. If later reporting must reconstruct each original pack/piece rate separately, the schema will need per-entry child rows or dedicated pack/piece snapshot fields.
- Sales history uses the existing 200-row default limit and supports optional location, status, and limit filters.

## Commit

`feat: add sales checkout and reversals`
