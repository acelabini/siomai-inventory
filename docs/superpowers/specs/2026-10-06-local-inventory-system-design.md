# Local Inventory System Design

## Purpose

Build a client-ready, offline desktop inventory and sales application for macOS. The application replaces the daily spreadsheet workflow shown in the reference image while preserving its familiar concepts: products, packs, pieces, replenishment, daily stock value, and date-based totals. It adds transaction-level sales, multiple cart/location support, stock transfers, reconciliation, reporting, imports, and recoverable backups.

The first release is for a single business operator using one Mac at a time. It does not require an internet connection, a cloud account, or a login.

## Delivery Target

- A signed and notarized universal macOS DMG containing the application.
- Support for macOS 13 Ventura or later on Apple Silicon and Intel Macs.
- No Node.js, database server, or developer tools required on the client's computer.
- Philippine peso (`PHP`) currency formatting and Asia/Manila business dates.
- Client-owned Apple Developer identity for production signing and notarization.
- Manual installer-based upgrades for version 1; upgrading must preserve the database.
- Source code, build and release instructions, user guide, import template, release notes, and acceptance-test checklist.

The application can be developed and tested on other operating systems, but the final universal DMG, signing, notarization, and installation acceptance test must run on macOS.

## Architecture

Use Electron Forge with React and TypeScript. Electron's main process owns the application lifecycle, SQLite connection, filesystem access, backups, imports, and exports. The renderer contains the interface only and communicates through a narrow, typed preload API.

The renderer is sandboxed with context isolation enabled and Node integration disabled. It loads bundled local assets only. IPC handlers validate all payloads before calling domain services. Domain services contain inventory, sales, reconciliation, and reporting rules independently of the interface. SQLite writes use transactions so a failed operation cannot partially update inventory.

The app stores the live database and backups in the macOS Application Support directory rather than inside the installed application bundle. Packaged upgrades therefore leave business data untouched.

## Core Data Model

### Location

A cart, branch, or stock-holding site. Fields include ID, name, optional description, active state, and timestamps. Each stock balance belongs to exactly one location.

### Product

Fields include ID, SKU, name, pieces per pack, purchase cost per pack, selling price per piece, selling price per pack, low-stock threshold in pieces, active state, and timestamps. SKU is unique. Pieces per pack is a positive whole number; monetary amounts are stored as integer centavos.

### Stock Movement

An immutable ledger entry containing location, product, signed piece quantity, movement type, timestamp, optional related entity, reason or note, and creation time. Movement types are opening balance, replenishment, sale, sale reversal, transfer in, transfer out, count adjustment, and manual adjustment.

Current stock is derived from the sum of movements for a product and location. The application may maintain a transactionally updated balance table for fast display, but the ledger remains the audit source of truth.

### Sale and Sale Line

A sale contains location, business timestamp, total amount, payment amount, change, optional note, status, and creation time. Each line stores product, quantity in pieces, entered unit (`piece` or `pack`), entered quantity, unit selling price, unit cost at the time of sale, line revenue, and line cost. Historical profit must not change when a product price or cost changes later.

A completed sale creates negative stock movements in the same SQLite transaction. A sale cannot be edited after completion. Voiding it records a reversal rather than deleting the original record.

### Transfer

A transfer moves stock between two active locations. It creates equal transfer-out and transfer-in movements in one database transaction and stores a transfer record with source, destination, product, quantity, timestamp, and note.

### Stock Count

A daily physical count records the counted pieces for a location and product. The app compares it with expected stock. Confirming a non-zero discrepancy requires a reason and creates a count-adjustment movement.

### Settings and Backup Metadata

Settings include business name, currency, timezone, backup directory preference, backup retention, and whether negative inventory is blocked. Version 1 fixes currency to PHP, timezone to Asia/Manila, and blocks negative inventory.

## Inventory Rules

- Store all stock quantities as whole pieces.
- Accept user quantities as pieces or packs and convert them using the product's current pieces-per-pack value.
- Display mixed stock as total pieces and a friendly pack equivalent, such as `2 packs + 18 pieces` and `2.3 packs` when exact decimal display is useful.
- Block replenishments, sales, transfers, and adjustments with zero or negative entered quantities.
- Block sales and transfers that would make stock negative.
- Replenishment cost uses the product's purchase cost at entry time and preserves that snapshot.
- Opening balance can be created only during setup or through an explicitly labeled correction workflow.
- Products and locations referenced by history are archived rather than deleted.
- Every corrective action is attributable through a timestamp and reason, even though version 1 has no user accounts.

## Primary Workflows

### First Run

The first-run wizard captures the business name, creates at least one location, and offers three product setup choices: import a CSV file, start from the provided siomai sample products, or enter products manually. It then collects opening stock by location and creates an initial backup.

### Dashboard

The dashboard defaults to today's Asia/Manila business date and a selected location. It shows stock value, sales revenue, gross profit, low-stock count, and discrepancy count. A spreadsheet-inspired inventory table lists product, on-hand packs/pieces, replenished quantity, sold quantity, remaining pieces, stock cost, selling value, and low-stock state. Location and date filters are always visible.

### Record Sale

The operator selects a location, adds products, chooses pieces or packs, and enters quantities. The screen displays available stock, prices, totals, payment, and change. Completing the sale validates inventory again inside the database transaction, creates the sale and stock movements, and presents a printable/simple receipt view. Version 1 does not require printer integration.

### Replenish and Transfer

Replenishment supports multiple products in one entry and accepts packs or pieces. Transfers select source and destination, show source availability, and atomically post both movement sides.

### Daily Count and Reconciliation

The operator enters physical counts at closing. The app shows expected, counted, and difference values before confirmation. Differences require a reason. The resulting report clearly separates sales-driven reductions from adjustments.

### Reports

Reports cover daily and date-range sales, inventory movement, stock valuation, gross profit, replenishments, transfers, discrepancies, and low-stock products. Each report can be filtered by location and product, printed through the system dialog, and exported to CSV.

### Backup and Restore

Create a validated automatic backup on app startup at most once per business day and before database migrations, CSV imports, and restores. Retain the latest 30 daily backups by default. Manual backup lets the operator choose a destination. Restore requires confirmation, verifies the selected file, backs up the current database first, replaces it only after validation, and relaunches the app.

## CSV Import

Version 1 imports product setup, locations, and opening stock through documented templates. It also supports the spreadsheet-style columns visible in the reference image when mapped during preview: product name, pieces per pack, pack quantity, replenishment quantity, pieces, and total cost.

The import flow has four stages: choose file, map columns, preview and validate, then commit. Invalid rows show row numbers and specific corrections. No data is written until the entire import passes validation. Duplicate SKUs are rejected; duplicate product names require an explicit mapping to an existing product or a corrected SKU.

Historical daily spreadsheet columns are imported as opening/replenishment/count movements when the available values support an unambiguous conversion. The app must never invent transaction-level sales from an aggregate spreadsheet. Any derived historical quantity is labeled as imported aggregate data.

## Interface Design

Use a calm, utilitarian desktop layout that feels familiar to spreadsheet users without reproducing a spreadsheet grid literally. A fixed left sidebar contains Dashboard, Sales, Inventory, Replenish, Transfers, Stock Count, Reports, Products, Locations, and Settings. The top bar contains the active location, business date, and a prominent `New Sale` action.

The visual system uses warm neutral surfaces with restrained green accents associated with fresh food and successful actions. Tables prioritize alignment and scanability: tabular numerals, right-aligned money and quantities, sticky headers, clear totals, and restrained row separators. Status never relies on color alone. Keyboard navigation, visible focus states, descriptive labels, and WCAG AA contrast are required.

Forms use progressive disclosure and inline validation. Destructive or corrective actions use explicit confirmation copy naming the affected sale, product, or database. Empty states teach the next action instead of showing blank tables.

The application is optimized for laptop widths from 1280 pixels upward and remains usable at 1024 pixels with horizontal table scrolling. Version 1 is desktop-only and does not target phones.

## Error Handling and Recovery

- Show plain-language errors with a useful next action; log technical details locally without exposing secrets.
- Wrap all multi-record business operations in SQLite transactions.
- Reject malformed IPC requests and unknown enum values.
- Recover from a renderer crash without corrupting the database.
- Detect migration failure, preserve the pre-migration backup, and stop with recovery instructions.
- Prevent concurrent import, restore, or migration operations.
- Detect a missing or inaccessible data directory and guide the user to choose a writable backup destination.

## Security and Privacy

- No network access is required for normal operation.
- No analytics, telemetry, remote fonts, or third-party content.
- Renderer sandbox enabled, context isolation enabled, Node integration disabled.
- Use an explicit Content Security Policy and expose only named preload methods.
- Validate all inputs at the IPC and domain boundaries.
- Never store Apple signing credentials or certificates in the repository.
- Backups contain business data and are not encrypted in version 1; the user guide tells the client to store them in a protected location.

## Testing Strategy

- Unit tests for quantity conversion, money calculations, stock availability, historical price snapshots, profit, and reconciliation.
- Domain integration tests against temporary SQLite databases for sales, reversals, transfers, imports, backups, restores, and migrations.
- React component tests for critical forms, validation messages, totals, and table states.
- Electron end-to-end smoke tests for first run, creating stock, completing and voiding a sale, transferring stock, reconciling a count, exporting a report, and reopening persisted data.
- Packaging checks for application metadata, icons, CSP, and absence of development URLs.
- Final macOS acceptance tests on Apple Silicon and Intel, using the signed and notarized universal DMG.

## Acceptance Criteria

1. A non-technical client installs the signed DMG by dragging the app into Applications and launches it without developer tools or Gatekeeper workarounds.
2. The client completes first-run setup, imports products/opening stock, and sees accurate per-location balances.
3. Piece and pack sales deduct the correct piece quantities and cannot oversell.
4. Revenue, cost, change, and gross profit use centavo-safe arithmetic and retain historical values.
5. Replenishments, transfers, sale reversals, and count adjustments create traceable ledger entries.
6. Daily and date-range reports match the ledger and export valid CSV files.
7. Automatic backup, manual backup, and tested restore preserve all business records.
8. Closing and reopening the app retains data; installing an upgrade preserves the database.
9. The renderer has no direct Node.js or database access and normal operation performs no network requests.
10. The release includes the DMG, source, documentation, import templates, release notes, and acceptance-test results.

## Explicit Non-Goals for Version 1

- Cloud synchronization, multi-device concurrent access, or remote access.
- User accounts, permissions, or employee attribution.
- Barcode scanners, receipt-printer integration, accounting integrations, or online payments.
- Purchase orders, supplier management, recipes/ingredient-level inventory, or manufacturing workflows.
- Mobile applications, web hosting, or Mac App Store submission.
- Automatic updater infrastructure.
