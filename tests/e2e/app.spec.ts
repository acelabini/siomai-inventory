import { mkdtemp, readdir, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import type { InventoryApi } from '../../src/shared/contracts';

let userData: string;
let exportPath: string;
let application: ElectronApplication;
let page: Page;
const appRoot = path.resolve(process.cwd());
const openingPieces = 500;

async function launch(): Promise<ElectronApplication> {
  return electron.launch({
    args: [appRoot, '--no-sandbox', '--disable-gpu'],
    env: {
      ...process.env,
      SIOMAI_E2E: '1',
      SIOMAI_E2E_USER_DATA: userData,
      SIOMAI_E2E_EXPORT_PATH: exportPath,
    },
    timeout: 30_000,
  });
}

async function bridge<T>(method: keyof InventoryApi, ...args: unknown[]): Promise<T> {
  return page.evaluate(async ({ name, values }) => {
    const action = window.inventoryApi[name] as unknown as (...input: unknown[]) => Promise<unknown>;
    return await action(...values) as T;
  }, { name: method, values: args });
}

test.beforeEach(async () => {
  userData = await mkdtemp(path.join(os.tmpdir(), 'siomai-e2e-'));
  exportPath = path.join(userData, 'sales-report.csv');
  application = await launch();
  page = await application.firstWindow();
  await expect(page.getByRole('heading', { name: 'Set up your business' })).toBeVisible();
});

test.afterEach(async () => {
  if (application) await application.close().catch(() => undefined);
  if (userData) await rm(userData, { recursive: true, force: true });
});

test('completes setup, stock workflows, report export, restart, void, and manual backup', async () => {
  await page.getByLabel('Business name').fill('E2E Siomai Cart');
  await page.getByLabel('Location name').fill('Main Cart');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('checkbox', { name: /Siomai/ }).first().check();
  await page.getByRole('button', { name: 'Continue to opening stock' }).click();
  const openingField = page.getByLabel(/Opening pieces for/).first();
  await openingField.fill(String(openingPieces));
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByRole('heading', { name: 'Today’s ledger' })).toBeVisible();

  await page.getByRole('button', { name: 'Products' }).click();
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.getByLabel('Selling price per piece (centavos)').fill('2500');
  await page.getByLabel('Selling price per pack (centavos)').fill('20000');
  await page.getByRole('button', { name: 'Save product' }).click();

  const products = await bridge<Array<{ id: string; name: string; piecesPerPack: number }>>('listProducts');
  const product = products[0]!;
  await page.getByRole('button', { name: 'Locations' }).click();
  await page.getByLabel('Location name').fill('Prep Store');
  await page.getByRole('button', { name: 'Save location' }).click();
  await expect(page.getByText('Prep Store', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sales' }).click();
  await page.getByLabel('Find a product').fill(product.name);
  await page.getByRole('button', { name: new RegExp(product.name) }).click();
  await page.getByLabel(`Quantity for ${product.name}`).fill('2');
  await page.getByLabel(`Unit for ${product.name}`).selectOption('piece');
  await page.getByLabel('Amount tendered').fill('50');
  await page.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.getByRole('status')).toContainText('Sale completed.');
  await expect(page.getByRole('heading', { name: 'Receipt' })).toBeVisible();

  await page.getByLabel('Find a product').fill(product.name);
  await page.getByRole('button', { name: new RegExp(product.name) }).click();
  await page.getByLabel(`Quantity for ${product.name}`).fill('1');
  await page.getByLabel(`Unit for ${product.name}`).selectOption('pack');
  await page.getByLabel('Amount tendered').fill('200');
  await page.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.getByRole('status')).toContainText('Sale completed.');

  await page.getByRole('button', { name: 'Transfers' }).click();
  await page.getByLabel('Source location').selectOption({ label: 'Main Cart' });
  await page.getByLabel('Destination location').selectOption({ label: 'Prep Store' });
  await page.getByLabel('Quantity').fill('1');
  await page.getByLabel('Unit').selectOption('pack');
  await page.getByRole('button', { name: 'Transfer stock' }).click();
  await expect(page.getByRole('status')).toContainText('Stock transfer recorded.');

  const expectedCount = openingPieces - 2 - product.piecesPerPack * 2 - 1;
  await page.getByRole('button', { name: 'Stock count' }).click();
  await page.getByLabel('Counted quantity').fill(String(expectedCount));
  await page.getByLabel('Reason').fill('E2E count discrepancy');
  await expect(page.getByText('Difference: -1 pc')).toBeVisible();
  await page.getByRole('button', { name: 'Submit stock count' }).click();
  await expect(page.getByRole('status')).toContainText('Stock count recorded.');

  await page.getByRole('button', { name: 'Reports' }).click();
  await page.getByLabel('Export').selectOption('sales');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  await expect(page.getByRole('status')).toContainText('CSV export saved.');
  await expect.poll(async () => readFile(exportPath, 'utf8')).toContain('grossProfit');

  await application.close();
  application = await launch();
  page = await application.firstWindow();
  await expect(page.getByRole('heading', { name: 'Today’s ledger' })).toBeVisible();
  const locations = await bridge<Array<{ id: string; name: string }>>('listLocations');
  const main = locations.find((location) => location.name === 'Main Cart')!;
  const persisted = await bridge<Array<{ productId: string; quantityPieces: number }>>('getBalances', main.id);
  expect(persisted.find((item) => item.productId === product.id)?.quantityPieces).toBe(expectedCount);
  await page.getByRole('button', { name: 'Sales' }).click();
  await page.getByRole('button', { name: 'View receipt' }).first().click();
  await page.getByRole('button', { name: 'Void sale' }).click();
  await page.getByLabel('Reason').fill('E2E void');
  await page.getByRole('button', { name: 'Confirm void' }).click();
  await expect(page.getByText('VOIDED SALE')).toBeVisible();
  const afterVoid = await bridge<Array<{ productId: string; quantityPieces: number }>>('getBalances', main.id);
  expect(afterVoid.find((item) => item.productId === product.id)?.quantityPieces).toBe(expectedCount + product.piecesPerPack);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Create backup now' }).click();
  await expect(page.getByRole('status')).toContainText('Backup created:');
  expect((await readdir(path.join(userData, 'backups'))).some((file) => file.startsWith('manual-') && file.endsWith('.sqlite'))).toBe(true);
  expect(await bridge('getSetupState')).toMatchObject({ complete: true, businessName: 'E2E Siomai Cart' });
});
