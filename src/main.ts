import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { openDatabase } from './main/db/database';
import { migrateDatabase } from './main/db/migrations';
import { registerCatalogHandlers } from './main/ipc/register-handlers';
import { CatalogService } from './main/services/catalog-service';
import { InventoryService } from './main/services/inventory-service';
import { SalesService } from './main/services/sales-service';
import { ReportService } from './main/services/report-service';
import { ImportService } from './main/services/import-service';
import { ExportService } from './main/services/export-service';
import { BackupService } from './main/services/backup-service';
import { OperationLock } from './main/services/operation-lock';
import { initializeAppDatabase } from './main/services/startup-recovery';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;

export function createWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Siomai Inventory',
    backgroundColor: '#F4F2EA',
    webPreferences: {
      preload: preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
}

export function getRendererDevServerUrl(): string | undefined {
  return typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'undefined'
    ? undefined
    : MAIN_WINDOW_VITE_DEV_SERVER_URL;
}

function createWindow(): void {
  const window = new BrowserWindow(
    createWindowOptions(path.join(__dirname, 'preload.cjs')),
  );
  const rendererUrl = getRendererDevServerUrl();

  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(
      path.join(__dirname, '../renderer/main_window/index.html'),
    );
  }
}

if (process.versions.electron) {
  if (!app.isPackaged && process.env.SIOMAI_E2E === '1' && process.env.SIOMAI_E2E_USER_DATA) {
    app.setPath('userData', process.env.SIOMAI_E2E_USER_DATA);
  }

  void app.whenReady().then(async () => {
    const databasePath = path.join(app.getPath('userData'), 'inventory.sqlite');
    const existingDatabase = existsSync(databasePath) && statSync(databasePath).size > 0;
    const db = openDatabase(databasePath);
    const operationLock = new OperationLock();
    const backups = new BackupService(db, databasePath, path.join(app.getPath('userData'), 'backups'));
    try {
      await initializeAppDatabase({
        existingDatabase,
        backups,
        operationLock,
        migrate: () => migrateDatabase(db),
        onReady: () => {
          const catalog = new CatalogService(db);
          const inventory = new InventoryService(db);
          const reports = new ReportService(db);
          registerCatalogHandlers(ipcMain, catalog, inventory, new SalesService(db), reports, new ImportService(db, catalog, inventory), new ExportService(), backups, operationLock);
          createWindow();
        },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'The safety backup could not be created.';
      dialog.showErrorBox('Database safety backup required', `${detail}\n\nNo database migration was started. Check storage permissions and available disk space, then relaunch Siomai Inventory.`);
      return;
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
