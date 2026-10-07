# Siomai Inventory UI/UX Redesign

**Date:** October 7, 2026  
**Status:** Approved visual direction; implementation pending  
**Scope:** Every renderer page and the shared application shell

## Intent

Refresh the existing offline desktop inventory application so a Philippine food-cart operator can understand the day, complete frequent stock tasks, and recover from mistakes quickly. The redesign must preserve the current workflows, local-first behavior, data contracts, and business logic while improving information hierarchy, navigation, readability, action clarity, feedback, and visual consistency.

The approved direction is an operator-focused ledger: compact enough for daily desktop use, warm rather than clinical, and visually tied to the business through banana-leaf green, turmeric gold, and rice-paper neutrals. It should feel purpose-built for a food-cart operation rather than like a generic administration template.

## Success Criteria

- Every existing page uses the same navigation, spacing, typography, controls, feedback, and data-display conventions.
- Frequent tasks—new sale, replenishment, transfer, and stock count—surface the information needed to confirm the result before submission.
- Operators can identify low stock, discrepancies, destructive actions, and successful completion without relying on color alone.
- Global location and business-date context stays visible and consistent across relevant pages.
- The app remains usable at its current minimum desktop width, responds cleanly at narrower widths, supports keyboard navigation, and respects reduced-motion preferences.
- Existing domain behavior and API contracts remain unchanged unless a presentation-only derived value is required.
- The application remains fully offline and introduces no runtime dependency on remote fonts, icons, images, or services.

## Visual Direction

### Palette

- **Night ink:** `#18201B` — navigation and high-contrast framing
- **Rice paper:** `#FFFEF8` — primary surfaces
- **Market canvas:** `#EEF0E9` — workspace background
- **Banana leaf:** `#1F6A49` — primary actions and positive states
- **Turmeric:** `#D89B2B` — confirmations, attention, and the brand signature
- **Chili:** `#C8402D` — destructive actions, discrepancies, and critical stock warnings

Neutral text and borders are derived from the night-ink and rice-paper colors. Warning, success, and destructive states pair color with explicit labels or icons.

### Typography

- Display and numeric emphasis: `Bahnschrift`, `Avenir Next Condensed`, `Arial Narrow`, then sans-serif.
- Body and controls: the platform system sans-serif stack.
- Aligned quantities and currency use tabular numerals.
- Headings use compact display typography; labels and helper text remain readable and avoid all-caps except for short structural kickers.

No web fonts are fetched at runtime.

### Layout Signature

The memorable element is a dark operational rail paired with a turmeric brand tile and a warm, ledger-like workspace. The rail groups destinations by job rather than exposing one undifferentiated list:

1. **Today:** Overview, New sale, Inventory
2. **Stock operations:** Replenish, Transfers, Stock count
3. **Review:** Reports, Products, Locations, Settings, Import data

The top context bar holds location, business date, help, and the globally available New sale action. Page-local filters remain in the page header or immediately above their results.

## Shared Application Shell

`AppShell` remains the owner of navigation and global context.

- Rename the Dashboard navigation label to **Overview** while preserving its internal route/view identifier if doing so avoids unnecessary state changes.
- Add consistent Lucide-style icons through a small local React icon layer. No network-loaded icon library is permitted.
- Group navigation by operator intent and preserve visible selected-page state with `aria-current="page"`.
- Keep the bottom portion of the rail for Settings, Import data, and application/version context.
- Make the location and date controls visually compact but fully labeled for assistive technology.
- Keep one high-emphasis **New sale** action in the top bar.
- At narrower desktop widths, collapse navigation labels while retaining accessible names and tooltips. At the smallest supported width, use a compact navigation treatment that does not cover the active workspace.

## Design System and Components

### Foundations

Replace page-specific visual decisions with shared tokens for color, spacing, radii, typography, shadows, and focus rings. The existing global stylesheet may remain the source of truth, but selectors should be organized around reusable primitives instead of page exceptions.

### Shared Components

- **PageHeader:** kicker, title, supporting text, and page actions.
- **Button:** primary, secondary, ghost, and destructive variants with loading and disabled states.
- **Field:** label, optional/required hint, control, helper text, and error message.
- **SelectField / DateField:** consistent wrappers for frequently repeated controls.
- **StatusBadge:** semantic icon/label combinations for healthy, low stock, warning, success, and voided states.
- **Panel:** a restrained surface with optional header and footer regions.
- **MetricCard:** compact value, label, and optional comparison or context.
- **DataTable:** responsive region, sticky headers where useful, numeric alignment, row actions, empty state, and accessible caption/label.
- **WorkflowSummary:** confirmation preview for sales and stock operations.
- **InlineNotice / Toast:** success, warning, and error feedback with specific recovery guidance.
- **EmptyState:** explains why the page is empty and provides the most relevant next action.
- **ConfirmDialog:** destructive and high-impact confirmations, including sale voiding and backup restoration.

Shared components must expose semantic props and avoid encoding page-specific business logic.

## Page Designs

### First-run Setup

- Use a focused two-column welcome layout: reassuring local/offline context on the left and the active step on the right.
- Show all three setup steps with a clear current and completed state.
- Keep each step focused on one decision: business/location details, product source, then opening stock.
- Preserve entered values when moving backward.
- Explain examples and units close to the relevant field.
- Confirm what will happen when setup finishes, including the CSV-import branch.

### Overview

- Lead with the selected location and business date, then show sales, gross profit, items sold, and stock value.
- Present low-stock or discrepancy attention as a single actionable notice, not as decorative cards.
- Show an inventory snapshot with status labels and a concise recent-activity feed.
- Empty states route operators to Products or Stock count as appropriate.
- The page summarizes existing report data and does not create a second reporting system.

### New Sale and Receipt

- Optimize the primary sales state for rapid product selection and payment.
- Keep product discovery on the left and the current order/checkout summary on the right.
- Show availability before a product is added.
- Keep quantity, entered unit, line revenue, total, tendered amount, and change visible before completion.
- The completion action is disabled until the order and payment are valid; explain validation next to the problem.
- After completion, retain a clear receipt with consistent Completed/Void status.
- Voiding uses an explicit destructive confirmation with a required reason and explains the stock impact.
- Recent sales remain accessible without competing with the active checkout flow.

### Inventory

- Provide search and status filtering above the ledger.
- Lead each row with product identity and keep quantities, pack equivalents, costs, and valuation aligned numerically.
- Low-stock thresholds appear as explicit labels, not color-only marks.
- Provide direct actions for Replenish and Stock count from the page header.
- Keep recent stock movements available as a secondary section or detail view.

### Replenish

- Use a form-and-summary layout.
- Capture location/date context, product, quantity, entered unit, and purchase cost.
- Preview total pieces, total cost, and resulting on-hand balance before submission.
- Support multiple product lines without losing the confirmation summary.
- After success, keep the entered ledger snapshot behavior and show a specific completion message.

### Transfers

- Visually pair source and destination and prevent selecting the same location twice.
- Show source availability while product and quantity are entered.
- Preview transfer pieces and resulting balances for both locations.
- Explain that both ledger movements are committed together.
- Preserve the existing atomic transfer behavior.

### Stock Count

- Show expected quantity, counted quantity, difference, and value impact together.
- Require a reason only when the count differs and explain why.
- Pair discrepancy color with a signed number and label.
- After submission, confirm that the adjustment and reason were recorded.

### Reports

- Keep location/date filters and export/print actions in the page header.
- Use a report-type selector so operators can focus on one report rather than scanning every table at once.
- Show the most relevant summary metrics for the selected report.
- Add a restrained daily-sales visualization only when supported by existing report data; otherwise retain a concise table-first layout.
- Preserve CSV export and print behavior, including print-specific navigation suppression.
- Empty and error states explain how to obtain report data or retry.

### Products

- Make the active product list primary and move add/edit into a focused form or dialog.
- Provide search and Active/Archived filtering.
- Display SKU, pack size, cost, selling price, and threshold in a scannable table.
- Explain centavo/peso conversions in user-facing currency units; raw storage units should not leak into labels.
- Archive actions require clear impact messaging.

### Locations

- Display locations as operational summaries with stock and recent activity context where available.
- Keep add/edit focused and separate from destructive archive actions.
- Identify the primary/current location without relying on color.
- Explain why a location cannot be archived when related records prevent it.

### Settings

- Organize settings into business profile, automatic/manual backups, restore, CSV import, and application information.
- Surface the current backup destination and last successful backup.
- Separate safe routine actions from restore/destructive actions.
- Restoring a backup uses an explicit confirmation and provides actionable failure feedback.
- CSV import is a clearly labeled route rather than a secondary button buried among backup controls.

### Import Data

- Preserve the four-stage workflow: Choose file, Map columns, Review, Import.
- Use a persistent progress indicator with current/completed states.
- Clarify supported import types before file selection.
- Mapping fields distinguish required and optional columns.
- Review summarizes valid rows, invalid rows, and file-level issues; errors identify rows and corrective action.
- The commit action remains disabled until validation passes.
- Completion states explain exactly what was imported and what was intentionally not created.

## Interaction and Feedback

- Use one primary action per action group.
- Button labels describe the result: **Complete sale**, **Record replenishment**, **Transfer stock**, **Submit stock count**, and **Restore backup**.
- Loading labels retain the action vocabulary: **Completing sale…**, **Recording…**, and **Restoring…**.
- Success feedback names the completed action and important result.
- Errors identify the failed operation and the next safe step. Avoid generic “Something went wrong” messages.
- Destructive actions use confirmation dialogs and never sit visually adjacent to the primary safe action without separation.
- Motion is limited to brief state transitions and disabled under `prefers-reduced-motion`.

## Responsive Behavior

The application remains desktop-first because it is an Electron operations tool.

- Wide: full navigation labels, two-column workflows, multi-column metrics, and full tables.
- Medium: icon-forward navigation, reduced page padding, two-column metrics, and stacked workflow summaries where required.
- Narrow supported window: compact navigation treatment, stacked page headers/forms, and horizontally contained data tables with clear scroll affordance.
- No content or action may be hidden solely because the window is narrow.

## Accessibility

- Preserve semantic headings and landmarks.
- Every field has a visible label; placeholder text never replaces a label.
- Keyboard focus uses a high-contrast visible ring.
- Icon-only buttons have accessible names and tooltips.
- Status is communicated with text or icon plus text, never color alone.
- Dynamic success and error feedback uses appropriate live regions.
- Dialogs trap focus, restore focus when closed, and support Escape when cancellation is safe.
- Touch/click targets remain comfortably usable even when their visible icons are compact.
- Tables retain captions or accessible region labels, and horizontally scrollable tables are keyboard reachable.

## Technical Boundaries

- Preserve the current React/Electron architecture and existing `InventoryApi` contracts.
- Do not change database schemas or domain services for visual-only requirements.
- Derive display summaries from already returned data where possible.
- Introduce new renderer components only where they reduce repetition or improve semantics.
- Do not add a general-purpose component framework; the design surface is small enough for focused local components and tokens.
- Do not add network-dependent assets or telemetry.
- Keep print styles for reports and ensure shared shell changes do not appear in print output.

## Testing Strategy

- Update renderer tests to assert accessible labels, visible states, validation feedback, and page-level actions rather than brittle CSS details.
- Add focused tests for navigation grouping/selection, responsive component states where feasible in JSDOM, destructive confirmations, and workflow summaries.
- Preserve existing service and integration tests unchanged unless their UI-facing copy is intentionally updated.
- Update the Electron end-to-end path to use the redesigned labels and verify the complete setup, catalog, sale, transfer, count, report, void, backup, and restart flow.
- Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run test:e2e` before completion.
- Verify key pages visually at wide, medium, and narrow desktop widths, in both light and dark host appearances if theme support is implemented.

## Out of Scope

- Cloud sync, user accounts, permissions, barcode scanning, printer integrations, purchase orders, automatic updates, or mobile-native layouts.
- Changes to inventory accounting, pricing rules, sale calculations, backup format, import semantics, or report definitions.
- Runtime web fonts, remote icon libraries, remote images, or other online dependencies.
