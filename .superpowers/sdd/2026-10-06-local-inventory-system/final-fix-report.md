# Final whole-branch review fixes

Base reviewed: `b52dfa8`

Scope: eight final-review findings; no unrelated plan/spec or `.gitignore` edits included.

## RED / GREEN evidence

| Finding | RED evidence | GREEN evidence |
|---|---|---|
| Pack preview centavo rounding | With the old renderer `Math.round(quantity * price)`, the focused SaleComposer test displayed `₱0.14` for `0.29 × 50¢`; it failed to find the expected `₱0.15`. | The renderer now calls the shared exact-decimal helper also used by checkout. Focused SaleComposer tests: 8/8 pass. Sales integration verifies `0.29` pack at `50¢` persists as `15¢`; sales service tests: 9/9 pass. |
| Duplicate normalized product names in one CSV | The new import preview test received an empty `errors` array for distinct SKUs named `Product Name` and `  product   name  `. | Preview attaches duplicate-name errors to rows 2 and 3, reports both as invalid, and commit throws before writes. Import service tests: 13/13 pass. |
| Low-stock threshold editor | Both new ProductsPage tests failed because no accessible threshold input existed. | The integer piece threshold is initialized to zero for new products, loaded when editing, validated as a nonnegative safe integer, and sent to `saveProduct`. Catalog service round-trip/rejection test and low-stock report threshold test pass; ProductsPage tests: 2/2 pass. |
| Signed final DMG | The release workflow regression failed because there was no signature check after DMG stapling (`finalSignatureCheck` was `-1`). The pre-fix flow also had no final DMG signing step after `hdiutil create`. | Workflow signs the exact `$FINAL_DMG` after creation, verifies it before notarization, and verifies it again after stapling and before upload. Static workflow tests: 5/5 pass. Actual macOS signing/notarization was not run on WSL. |
| Dashboard stock-count action | The dashboard test could not find the truthful reconciliation action; prior copy said “Record opening stock” while routing to Stock count. | Action now says “Reconcile stock count,” describes comparing physical stock with current records, and is tested to navigate to Stock count. |
| First-run import choice | Setup test failed to find the CSV import radio choice and completion action. | First-run now offers samples, CSV import, or manual product entry. Choosing import completes the required business/location setup with an empty, valid catalog, then App opens Import. Setup component and App flow tests pass. |
| Repeated sale lines | Draft-line accessibility assertions failed on indistinguishable quantity/remove/unit names; repeated receipt products emitted React’s duplicate key warning for `pork`. | Draft quantity, unit, and remove labels include the displayed line number; receipt rows use product-plus-position keys and preserve each source row. Renderer tests confirm separate controls and receipt rows. |
| Daily ribbon scope | Dashboard test could not find an activity-summary description; the view gave no indication the ribbon omits transfers, count adjustments, and void restocks. | The ribbon is labeled “Daily activity summary” and discloses omitted categories. Operator guide now describes it as a summary rather than full reconciliation. Dashboard test verifies the scope text. |

## Verification

All commands below used Node `v22.23.3` first in `PATH` and npm `10.9.4` from `/tmp/siomai-npm/node_modules/npm/bin/npm-cli.js`.

- Focused regression run across sale renderer/service, import service, product UI/catalog service, setup, dashboard, and release workflow: 8 files, 54 tests passed.
- Full suite: `npm test` — 22 files, 138 tests passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed with zero warnings/errors.
- `npm run test:e2e` — passed, 1 Electron workflow test.
- `npm run package` — Linux x64 Electron package completed.
- `npm run check:package` — passed; checked 11 ASAR entries. macOS bundle-only checks were skipped by the checker on Linux.
- `git diff --check` — passed.

## Platform limits and preserved notes

The macOS-only Developer ID signature, notarization, stapling, Gatekeeper, and universal architecture checks remain for the configured macOS release workflow with client credentials. Historical stock valuation continues to use current catalog purchase cost and remains disclosed in the operator guide. The existing `.gitignore` edit and line-ending-only changes in the plan/spec are outside this commit and were left untouched.

## Follow-up review round 1

At base `3af1f36`, the repeated-line test was extended to assert both unit-selector accessible names. RED: `npm test -- tests/renderer/sale-composer.test.tsx` failed 1 test because the first selector was named `Unit for Siomai Pork` instead of `Line 1: Unit for Siomai Pork` (7/8 passed). GREEN: after adding the displayed line number to the selector's `aria-label`, the same focused command passed 8/8. Follow-up verification, using Node `v22.23.3` first in `PATH` and npm `10.9.4`, passed: full suite 22 files / 138 tests; typecheck; lint; Electron E2E 1/1; Linux package; package checker (11 ASAR entries); and `git diff --check`. The package checker skipped macOS-only bundle checks on Linux.
