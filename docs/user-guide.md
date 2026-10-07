# Siomai Inventory — Operator Guide

This guide is for the cart operator. The app works offline and keeps inventory on this Mac. It does not sign in to an online service.

## Install and open

1. Open the Siomai Inventory DMG supplied by the business maintainer.
2. Drag **Siomai Inventory** to **Applications**.
3. Eject the DMG, then open Siomai Inventory from Applications. The production DMG is Developer ID signed and notarized; do not bypass macOS Gatekeeper for an installer that has not passed the release checklist.
4. On first launch, enter the business and first cart/location name. Then choose the included sample products, finish setup and continue directly to CSV import, or finish setup and add products manually. Business and location setup is saved before CSV import opens, so the import has an active location for opening stock.
5. Enter opening stock in whole pieces. Sample products start with no selling price: set each piece and pack selling price under **Products** before recording a sale.

## Daily work

The left navigation opens Dashboard, Sales, Inventory, Replenish, Transfers, Stock count, Reports, Products, Locations, and Settings. The top bar shows the active location and business date. Check the location before recording stock activity.

### Sell pieces or packs

1. Choose **Sales** or **+ New sale**.
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

The Dashboard shows a daily activity summary for opening, replenished, sold, and on-hand quantities plus revenue, gross profit, stock value, discrepancies, and low-stock items. The summary is not a full reconciliation: transfers, count adjustments, and voided-sale restocks are not separate categories there. Review detailed movement and count reports when reconciling. Select a location and business date as needed. **Reports** provides sales, stock movements, valuation, profit, count discrepancies, and low-stock details. Choose an export type and select **Export CSV**. Use **Print report** for the macOS print dialog.

Historical stock valuation uses the product's current purchase cost because version 1 does not keep a separate cost snapshot for every stock unit. Sale cost and profit do keep the cost at the time of sale.

## Products, locations, and CSV files

Use **Products** to add or edit a SKU, product name, pieces per pack, purchase cost per pack, piece price, pack price, and low-stock threshold. Use **Locations** to add carts or stock-holding sites. Products and locations with history should be archived instead of removed.

CSV imports are available from **Settings → Import CSV data**. Start with a template under `docs/import-templates/`:

- `products.csv` creates a product catalog.
- `opening-stock.csv` assigns opening pieces to a location.
- `spreadsheet-example.csv` shows columns that can be mapped from the old daily spreadsheet.

Import preview reports invalid rows before any change is committed. Duplicate SKUs are rejected. Aggregate spreadsheet values do not become invented transaction-level sales. Exported report CSV files use a header row and peso-formatted amounts.

## Backups and recovery

Automatic backups are made at most once per Manila business day and the latest 30 daily backups are retained. The default data folder is:

```text
~/Library/Application Support/Siomai Inventory/
```

It contains `inventory.sqlite` and the `backups/` directory. **Settings → Create backup now** makes a manual copy. Store a copy on a protected, separate drive or approved business storage; app backups are not encrypted.

To restore, open **Settings → Restore from backup**, choose a valid `.sqlite` backup, review the confirmation, and confirm. The app first saves a safety backup of the current database and relaunches after a successful restore. Keep the Mac powered on until it opens again. Do not replace or delete `inventory.sqlite` while the app is running.

If startup reports a backup or database error, note the message, check free disk space and folder permissions, and contact the maintainer before moving database files. Preserve the original database and every backup while recovering.

## Updates and data location

Version 1 updates are installed manually. Quit the app, keep a current backup, open the new signed DMG, and replace the existing Siomai Inventory app in Applications. Do not remove the Application Support folder: it holds the business database and backups and is separate from the app bundle.

The database contains business records and has no account protection or app-level encryption. Use the Mac's normal access controls and FileVault, and protect any external backup media.
