import { app, BrowserWindow, ipcMain } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import path from 'node:path';
import { openDatabase } from './main/db/database';
import { migrateDatabase } from './main/db/migrations';
import { registerCatalogHandlers } from './main/ipc/register-handlers';
import { CatalogService } from './main/services/catalog-service';

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
  void app.whenReady().then(() => {
    const db = openDatabase(path.join(app.getPath('userData'), 'inventory.sqlite'));
    migrateDatabase(db);
    registerCatalogHandlers(ipcMain, new CatalogService(db));
    createWindow();

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
