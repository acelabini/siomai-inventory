# Offline Mobile PWA Design

## Intent

Build a phone-only web version of Siomai Inventory that preserves the existing product, stock, sales, reporting, import, and recovery workflows without requiring an Apple Developer Program subscription. The result installs from Safari to an iPhone Home Screen, launches in a standalone app window, and continues to work without a network after its first successful load.

The mobile ledger is intentionally independent from the existing Mac ledger. It has no accounts, cloud database, background synchronization, or server-side application component. A static HTTPS host is required only to deliver the web assets and future updates.

Success means an operator can install the app on one iPhone, complete setup, perform every current business workflow, close and reopen it offline without losing data, export reports, and create and restore a portable backup.

## Scope

The PWA provides functional parity with the existing desktop renderer:

- initial business and location setup;
- products and locations, including archive behavior;
- opening stock, replenishment, transfers, and stock counts;
- sales, receipts, sale history, and voids;
- dashboard and all current reports;
- CSV import and CSV report export;
- business-name settings;
- local backup and restore.

Desktop-only mechanics are translated instead of copied. Native file dialogs become browser file pickers, report files download or open through the platform share sheet, SQLite backups become versioned JSON ledger backups, and “relaunch” becomes a safe page reload after restore. Browser printing remains available through the existing print action where supported.

## Non-goals

- App Store, TestFlight, native Swift, Capacitor, or signed IPA distribution.
- Live data sharing with the Mac or another phone.
- Accounts, authentication, cloud sync, push notifications, or a hosted database.
- Automatic external backups, because a browser cannot silently write durable files on iOS.
- Background jobs while the PWA is closed.

## Architecture

The React renderer and `InventoryApi` contract remain the application boundary. Electron continues to obtain that API from `window.inventoryApi`; a normal browser creates a `BrowserInventoryApi` backed by IndexedDB. Pages do not branch on storage technology.

Browser persistence uses Dexie over IndexedDB. Separate focused services own catalog/setup, stock operations, sales/reporting, and browser file operations. Multi-record business operations run in one IndexedDB transaction so stock and its corresponding audit records either both commit or both roll back. Existing Zod schemas and exact quantity/money helpers remain the validation and arithmetic authority.

The standalone web build uses Vite plus `vite-plugin-pwa`. Its service worker precaches the application shell and static assets. Runtime business data never enters the service-worker cache; it stays in IndexedDB. The Electron build remains isolated from the PWA plugin and browser dependencies at runtime.

## Browser Data Model

IndexedDB stores records equivalent to the current SQLite schema:

- settings;
- locations;
- products;
- inventory balances;
- stock movements;
- replenishments and lines;
- transfers;
- stock counts and lines;
- sales and sale lines.

Records use the same public IDs, centavo integers, whole-piece balances, Manila business dates, status values, and cost snapshots as the desktop application. Compound keys identify per-location product balances. Indexed timestamps use ISO 8601 strings so ordering and backup serialization are deterministic.

The first browser schema version is `1`. Database upgrades must be forward-only. A backup document contains a format name, format version, creation timestamp, and all business tables. Restore validates the complete document before opening a write transaction. Invalid, newer, truncated, or structurally inconsistent backups leave the current ledger untouched.

## Business Rules

The web implementation must match the existing desktop rules:

- all public inputs pass through the existing Zod schemas;
- quantities must convert exactly to whole pieces;
- stock never becomes negative;
- transfers reject identical source and destination locations;
- sales snapshot selling price and unit cost at completion;
- a completed sale is immutable except for one reasoned void;
- voiding restores stock once and preserves the original sale;
- report dates use `Asia/Manila`;
- product and location history remains readable after archival;
- imports preview and validate before committing any data.

## Mobile Information Architecture

The current desktop visual identity remains: night ink, banana-leaf green, turmeric, chili, rice paper, condensed operational headings, and monospaced financial values. The design risk is deliberate: the primary mobile navigation resembles a compact cart order rail rather than a generic hamburger-only dashboard.

At widths up to 760 px:

- a safe-area-aware bottom rail exposes Overview, New sale, Inventory, and More;
- More opens an accessible sheet containing replenishment, transfers, stock count, reports, products, locations, import, and settings;
- the header becomes a compact location/date context strip;
- the workspace reserves bottom space so actions and content are never hidden by the rail or iPhone Home indicator;
- touch targets are at least 44 by 44 CSS pixels;
- two-column workflows collapse into a single reading order;
- data tables render as labeled record cards when column density would require horizontal panning;
- destructive confirmations remain modal and restore focus on close.

Tablet and desktop widths retain the existing side navigation. Motion is limited to the More sheet and honors `prefers-reduced-motion`.

## Installation and Offline Behavior

The web manifest declares `display: standalone`, portrait-friendly presentation, theme/background colors from the product palette, and 192 px and 512 px maskable icons plus an Apple touch icon. An iOS-specific install notice explains Safari’s Add to Home Screen action without blocking normal browser use.

On startup the browser adapter requests persistent storage where supported. If persistence is unavailable or denied, the UI shows a durable-data warning and points the operator to Backup. The PWA may be used offline only after one complete online load has installed the application shell. Updates use the generated service worker and activate on the next reload; they never clear IndexedDB.

## File and Recovery Flows

CSV import opens a hidden file input accepting `.csv` and text CSV MIME types, rejects files larger than the existing 5 MB schema limit, and passes decoded text through the existing preview/commit contract.

CSV report export creates a Blob with a deterministic file name and downloads it. Backup creates a versioned JSON Blob. Where the Web Share API supports files, the app may use the share sheet; otherwise it downloads. Canceling a picker is a normal no-op.

Restore stages the selected document behind a short-lived token, validates it, asks for confirmation through the existing Settings flow, then replaces all business tables in one transaction. A recoverable in-memory copy of the current ledger is made before replacement; a failed write restores the original transaction state automatically. After success the page reloads and reads the restored setup state.

## Error Handling

Expected business failures use actionable messages already established by the desktop services. Storage initialization failure shows a blocking recovery screen rather than an endless loader. Transaction failures reject the calling API method and preserve prior data. File parsing, validation, and download failures surface through the existing inline notices.

No unhandled promise rejection may leave the operator believing an operation succeeded. All mutation controls keep their current busy/disabled behavior.

## Testing

Browser service tests run against `fake-indexeddb` and exercise setup, catalog uniqueness, atomic stock workflows, insufficient-stock rejection, sales and voids, Manila-date reports, import commit, backup round-trip, and invalid-restore preservation.

Renderer tests cover runtime API selection, the mobile navigation sheet, safe labels in card tables, install/storage notices, and browser-specific Settings copy. Existing Electron integration and renderer tests remain green apart from documented host-specific baseline failures.

Playwright runs the standalone web build with an iPhone-sized viewport. It verifies setup and a sale, reload persistence, install metadata, a registered service worker, and a second launch with the server unavailable after the shell has been cached.

## Delivery

`npm run build:web` produces a static `dist/web` directory. `npm run preview:web` serves the production build locally. Any static HTTPS provider can host the directory; no Node process, application server, or database server is deployed.

The operator guide documents installation from Safari, the independent-ledger limitation, first-load/offline behavior, manual backup discipline, restore, and updating. The build guide documents static hosting and cache-safe releases.
