# Siomai Inventory — Operator Guide

This guide is for the cart operator. Siomai Inventory works on a Mac or as an installed iPhone web app. Each device keeps its own ledger and has no sign-in. **The phone does not sync with the Mac or another phone.** Choose which device holds the working ledger before recording business activity.

## Install on iPhone

The maintainer supplies a stable HTTPS web address. No Apple Developer subscription, App Store purchase, or TestFlight installation is needed for the web app.

1. Connect to the internet and open that address in **Safari**, using normal browsing rather than a private tab.
2. Let the first page finish loading. The first complete online load installs the files needed for offline use; an address that has never loaded on this phone cannot open offline.
3. In Safari's Share menu, choose **Add to Home Screen** and confirm **Add**. Open the new Siomai icon. Menu wording can vary with the iOS version.
4. Enter the business and cart/location name. Choose sample products and opening stock, or finish setup and add products or import CSV data. Set each product's piece and pack prices under **More → Products** before selling.
5. After the app has loaded online, close it, turn on airplane mode, and reopen the Home Screen icon. Confirm Overview and your stock appear before relying on it during service. If they do not, reconnect, open the app completely, and repeat this check.

The ledger lives in this browser's local storage (IndexedDB); app files are cached separately. A storage warning means the browser could not promise persistent storage. Export backups regularly even when there is no warning. Clearing website data or losing the phone can remove the ledger. Keep the same supplied web address and use the installed app consistently.

## Install on Mac

1. Open the Siomai Inventory DMG supplied by the business maintainer.
2. Drag **Siomai Inventory** to **Applications**.
3. Eject the DMG, then open Siomai Inventory from Applications. The production DMG is Developer ID signed and notarized; do not bypass macOS Gatekeeper for an installer that has not passed the release checklist.
4. On first launch, enter the business and first cart/location name. Then choose the included sample products, finish setup and continue directly to CSV import, or finish setup and add products manually. Business and location setup is saved before CSV import opens, so the import has an active location for opening stock.
5. Enter opening stock in whole pieces. Sample products start with no selling price: set each piece and pack selling price under **Products** before recording a sale.

## Daily work

On a phone, the bottom rail opens **Overview**, **New sale**, **Inventory**, and **More**. More opens Replenish, Transfers, Stock count, Reports, Products, Locations, Import data, and Settings. On larger screens these destinations appear in the left navigation. The top bar shows the active location and Manila business date. Check the location before recording stock activity.

### Sell pieces or packs

1. Choose **New sale**.
2. Search by product name or SKU and add it to the sale.
3. Enter a positive quantity and choose **Piece** or **Pack**. The app converts packs using that product's pieces-per-pack value and shows the available quantity and total.
4. Enter the amount received in pesos. Complete the sale when the amount covers the total. The receipt shows the change and saved sale details.

Completed sales are locked. To correct one, open its receipt, choose **Void sale**, enter a reason, and confirm. The original stays in the sales history and a reversal returns its sold stock.

### Replenish stock

Open **Replenish**, confirm the location, select a product, enter a positive piece or pack quantity, and record the delivery. The new quantity is added to that location's stock history.

### Move stock between carts

Open **Transfers**, select the source and destination locations, and choose the product and piece or pack quantity. The transfer is recorded only when the source has enough stock. Both sides of the transfer post together.

### Count stock at closing

Open **Stock count**, select the product, and enter the physical piece or pack count. Compare the difference with expected stock. If it differs, enter why before submitting. The app records the adjustment and reason in the movement history.

### Review and export reports

Overview shows a daily activity summary for opening, replenished, sold, and on-hand quantities plus revenue, gross profit, stock value, discrepancies, and low-stock items. The summary is not a full reconciliation: transfers, count adjustments, and voided-sale restocks are not separate categories there. Review detailed movement and count reports when reconciling. Select a location and business date as needed. **Reports** provides sales, stock movements, valuation, profit, count discrepancies, and low-stock details. Choose an export type and select **Export CSV**. On a phone, save the downloaded CSV through Safari/Files. **Print report** uses the browser or macOS print interface where supported.

Historical stock valuation uses the product's current purchase cost because version 1 does not keep a separate cost snapshot for every stock unit. Sale cost and profit do keep the cost at the time of sale.

## Products, locations, and CSV files

Use **Products** to add or edit a SKU, product name, pieces per pack, purchase cost per pack, piece price, pack price, and low-stock threshold. Use **Locations** to add carts or stock-holding sites. Products and locations with history should be archived instead of removed.

CSV imports are available from **More → Import data** or **Settings → Open import data**. Choose a CSV file from Files on a phone; files must be 5 MB or smaller. Start with a template under `docs/import-templates/`:

- `products.csv` creates a product catalog.
- `opening-stock.csv` assigns opening pieces to a location.
- `spreadsheet-example.csv` shows columns that can be mapped from the old daily spreadsheet.

Import preview reports invalid rows before any change is committed. Duplicate SKUs are rejected. Aggregate spreadsheet values do not become invented transaction-level sales. Exported report CSV files use a header row and peso-formatted amounts.

## Backups and recovery

### Phone: export and restore a JSON ledger

There are **no automatic external backups** on the phone. At the end of each business day, before an update or restore, and after important corrections:

1. Open **More → Settings → Create manual backup**.
2. Save the downloaded `siomai-backup-….json` file in Files, then keep a copy in protected storage separate from the phone. Check that the saved file exists; the app cannot guarantee that an offered download was saved outside the browser.
3. Keep several dated copies. Backup files contain business data and are not encrypted by the app.

To recover, first export the current ledger if you need to keep it. Choose **Settings → Restore from backup**, select a known-good web JSON backup in Files, review the filename and replacement warning, and choose **Restore backup**. Restore replaces the entire phone ledger; it does not merge records. The page reloads after success. Check the business name, location, stock, and recent sales. Invalid or incompatible files are rejected without changing current records. If the selection expires, choose the file again.

Phone JSON backups and desktop `.sqlite` backups are different formats and cannot be restored into each other. CSV import is available for supported catalog/opening-stock migration, but is not a full-ledger backup or synchronization service. The phone's temporary in-memory restore safety copy is not an external backup and does not survive reloading.

### Mac: SQLite backups

Automatic backups are made at most once per Manila business day and the latest 30 daily backups are retained. The default data folder is:

```text
~/Library/Application Support/Siomai Inventory/
```

It contains `inventory.sqlite` and the `backups/` directory. **Settings → Create manual backup** makes a manual copy. Store a copy on a protected, separate drive or approved business storage; app backups are not encrypted.

To restore, open **Settings → Restore from backup**, choose a valid `.sqlite` backup, review the confirmation, and confirm. The app first saves a safety backup of the current database and relaunches after a successful restore. Keep the Mac powered on until it opens again. Do not replace or delete `inventory.sqlite` while the app is running.

If startup reports a backup or database error, note the message, check free disk space and folder permissions, and contact the maintainer before moving database files. Preserve the original database and every backup while recovering.

## Updates and data location

On a phone, finish any open sale or stock form and export a backup first. Reconnect and open the app so it can download a release from the same HTTPS address. Close all Siomai browser tabs and installed-app windows, then reopen the Home Screen icon. A waiting update activates after the old windows close; updates do not interrupt an open form. If you still see an old version, reconnect and repeat the close/reopen cycle. Updates preserve IndexedDB. Do not clear website data to force an update. Verify the ledger, then check an offline reopening again.

On Mac, updates are installed manually. Quit the app, keep a current backup, open the new signed DMG, and replace the existing Siomai Inventory app in Applications. Do not remove the Application Support folder: it holds the business database and backups and is separate from the app bundle.

The ledger contains business records and has no account protection or app-level encryption. Protect the phone with its normal device lock; use the Mac's access controls and FileVault. Protect external backup media on either platform.
