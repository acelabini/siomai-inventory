import { mkdir, mkdtemp, readdir, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import type { InventoryApi } from '../../src/shared/contracts';

let userData: string;
let appDataPath: string;
let exportPath: string;
let launchCount = 0;
let application: ElectronApplication;
let page: Page;
const appRoot = path.resolve(process.cwd());
const appName = 'Siomai Inventory';
const packagedExecutable = process.platform === 'darwin'
  ? path.join(appRoot, 'out', `${appName}-darwin-${process.arch}`, `${appName}.app`, 'Contents', 'MacOS', appName)
  : path.join(appRoot, 'out', `${appName}-${process.platform}-${process.arch}`, `${appName}${process.platform === 'win32' ? '.exe' : ''}`);
const openingPieces = 500;
const screenshots = path.join(appRoot, 'out', 'e2e-screenshots');
test.setTimeout(120_000);

async function completeSampleSetup(businessName: string, locationName: string) {
  await page.getByLabel('Business name').fill(businessName);
  await page.getByLabel('Location name').fill(locationName);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('checkbox', { name: /Siomai/ }).first().check();
  await page.getByRole('button', { name: 'Continue to opening stock' }).click();
  await page.getByLabel(/Opening pieces for/).first().fill(String(openingPieces));
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByRole('heading', { name: 'Today at a glance' })).toBeVisible();
}

async function assertNoDocumentOverflow() {
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )).toBe(0);
}

async function capture(name: string, width: number) {
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, `${name}-${width}.png`), fullPage: true });
}

async function launch(): Promise<ElectronApplication> {
  launchCount += 1;
  return electron.launch({
    executablePath: packagedExecutable,
    args: [
      '--no-sandbox', '--disable-gpu', '--disable-background-networking',
      '--host-resolver-rules=MAP * ~NOTFOUND', '--proxy-server=127.0.0.1:9',
      `--log-net-log=${path.join(userData, `startup-netlog-${launchCount}.json`)}`,
    ],
    env: {
      ...process.env,
      XDG_CONFIG_HOME: userData,
      APPDATA: userData,
      HOME: userData,
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
  launchCount = 0;
  exportPath = path.join(userData, 'sales-report.csv');
  application = await launch();
  expect(await application.evaluate(({ app }) => app.isPackaged)).toBe(true);
  appDataPath = await application.evaluate(({ app }) => app.getPath('userData'));
  expect(appDataPath.startsWith(userData)).toBe(true);
  page = await application.firstWindow();
  await expect(page.getByRole('heading', { name: 'Set up your business' })).toBeVisible();
});

test('loads packaged startup and renderer assets with remote hosts blocked', async () => {
  expect(await application.evaluate(({ app }) => app.commandLine.getSwitchValue('host-resolver-rules'))).toContain('MAP * ~NOTFOUND');
  expect(await application.evaluate(({ app }) => app.commandLine.getSwitchValue('proxy-server'))).toBe('127.0.0.1:9');
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Set up your business' })).toBeVisible();
  expect(requests.some((url) => url.startsWith('file:'))).toBe(true);
  expect(requests.filter((url) => /^https?:/i.test(url))).toEqual([]);
  await application.close();
  const netLog = JSON.parse(await readFile(path.join(userData, 'startup-netlog-1.json'), 'utf8')) as {
    events: Array<{ params?: { url?: string } }>;
  };
  expect(netLog.events.length).toBeGreaterThan(0);
  const remoteUrls = netLog.events.flatMap((event) => event.params?.url ?? []).filter((url) => /^https?:/i.test(url));
  expect(remoteUrls.every((url) => /^https:\/\/redirector\.gvt1\.com\/edgedl\/chrome\/dict\/[^/]+\.bdic$/.test(url))).toBe(true);
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
  await expect(page.getByRole('heading', { name: 'Today at a glance' })).toBeVisible();

  await page.getByRole('button', { name: 'Products' }).click();
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.getByLabel('Selling price per piece (pesos)').fill('25');
  await page.getByLabel('Selling price per pack (pesos)').fill('200');
  await page.getByRole('button', { name: 'Save product' }).click();

  const products = await bridge<Array<{ id: string; name: string; sku: string; piecesPerPack: number }>>('listProducts');
  const product = products[0]!;
  await page.getByRole('button', { name: 'Locations' }).click();
  await expect(page.getByRole('heading', { name: 'Locations', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add location' }).first().click();
  await page.getByLabel('Location name').fill('Prep Store');
  await page.getByRole('button', { name: 'Save location' }).click();
  await expect(page.getByText('Prep Store', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'New sale' }).first().click();
  await page.getByLabel('Find a product').fill(product.name);
  await page.getByRole('button', { name: `Add ${product.name} (${product.sku})` }).click();
  await page.getByLabel(`Quantity for ${product.name}`).fill('2');
  await page.getByLabel(`Unit for ${product.name}`).selectOption('piece');
  await page.getByLabel('Amount tendered').fill('50');
  await page.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.getByRole('status')).toContainText('Sale completed.');
  await expect(page.getByRole('heading', { name: 'Receipt' })).toBeVisible();
  await expect(page.locator('.sale-receipt').getByText('Completed', { exact: true })).toBeVisible();

  await page.getByLabel('Find a product').fill(product.name);
  await page.getByRole('button', { name: `Add ${product.name} (${product.sku})` }).click();
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
  await page.getByLabel('Report type').selectOption('sales');
  await application.evaluate(({ dialog }, destination) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination });
  }, exportPath);
  await page.getByRole('button', { name: 'Export CSV' }).click();
  await expect(page.getByRole('status')).toContainText('CSV export saved.');
  await expect.poll(async () => readFile(exportPath, 'utf8')).toContain('grossProfit');

  await application.close();
  application = await launch();
  page = await application.firstWindow();
  await expect(page.getByRole('heading', { name: 'Today at a glance' })).toBeVisible();
  const locations = await bridge<Array<{ id: string; name: string }>>('listLocations');
  const main = locations.find((location) => location.name === 'Main Cart')!;
  const persisted = await bridge<Array<{ productId: string; quantityPieces: number }>>('getBalances', main.id);
  expect(persisted.find((item) => item.productId === product.id)?.quantityPieces).toBe(expectedCount);
  await page.getByRole('button', { name: 'New sale' }).first().click();
  await page.getByRole('button', { name: 'View receipt' }).first().click();
  await page.getByRole('button', { name: 'Void sale' }).click();
  await page.getByLabel(/reason/i).fill('E2E void');
  await page.getByRole('button', { name: 'Confirm void' }).click();
  await expect(page.locator('.sale-receipt').getByText('Voided', { exact: true })).toBeVisible();
  const afterVoid = await bridge<Array<{ productId: string; quantityPieces: number }>>('getBalances', main.id);
  expect(afterVoid.find((item) => item.productId === product.id)?.quantityPieces).toBe(expectedCount + product.piecesPerPack);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Create manual backup' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Manual backup created.' })).toBeVisible();
  expect((await readdir(path.join(appDataPath, 'backups'))).some((file) => file.startsWith('manual-') && file.endsWith('.sqlite'))).toBe(true);
  expect(await bridge('getSetupState')).toMatchObject({ complete: true, businessName: 'E2E Siomai Cart' });
});

test('keeps pages and full names usable at wide, medium, and narrow desktop widths', async () => {
  const businessName = `Siomai cart ${'North market kiosk '.repeat(5)}`.slice(0, 118).trim();
  const locationName = `Main cart ${'Harbor entrance stall '.repeat(5)}`.slice(0, 118);
  const productName = `Special siomai ${'chili garlic family pack '.repeat(4)}`.slice(0, 118);
  const remoteRequests: string[] = [];
  page.on('request', (request) => { if (/^https?:/i.test(request.url())) remoteRequests.push(request.url()); });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByLabel('Business name').fill(businessName);
  await page.getByLabel('Location name').fill(locationName);
  await assertNoDocumentOverflow();
  await capture('setup', 1280);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('checkbox', { name: /Siomai/ }).first().check();
  await page.getByRole('button', { name: 'Continue to opening stock' }).click();
  await page.getByLabel(/Opening pieces for/).first().fill(String(openingPieces));
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByRole('heading', { name: 'Today at a glance' })).toBeVisible();
  await expect(page.getByLabel('Current location')).toHaveAttribute('title', locationName);

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Products' }).click();
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.getByLabel('Product name').fill(productName);
  await page.getByRole('button', { name: 'Save product' }).click();
  await expect(page.getByLabel(productName, { exact: true })).toBeVisible();

  const views = [
    { nav: 'Overview', heading: 'Today at a glance', action: 'New sale', slug: 'overview' },
    { nav: 'New sale', heading: 'New sale', action: 'Complete sale', slug: 'new-sale' },
    { nav: 'Inventory', heading: 'Inventory', action: 'Stock count', slug: 'inventory' },
    { nav: 'Reports', heading: 'Reports', action: 'Export CSV', slug: 'reports' },
    { nav: 'Products', heading: 'Products', action: 'Add product', slug: 'products' },
    { nav: 'Settings', heading: 'Settings', action: 'Create manual backup', slug: 'settings' },
    { nav: 'Import data', heading: 'Import data', action: 'Choose CSV file', slug: 'import' },
  ] as const;
  for (const width of [1280, 980, 760]) {
    await page.setViewportSize({ width, height: 900 });
    const railLabelWidth = await page.locator('.nav-link-label').first().evaluate((element) => element.getBoundingClientRect().width);
    if (width === 1280) expect(railLabelWidth).toBeGreaterThan(1);
    else expect(railLabelWidth).toBeLessThanOrEqual(1);
    for (const view of views) {
      const nav = page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: view.nav });
      await expect(nav).toBeVisible();
      await nav.click();
      await expect(nav).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('heading', { name: view.heading, exact: true, level: 1 })).toBeVisible();
      await expect(page.getByRole('button', { name: view.action }).last()).toBeVisible();
      if (view.slug === 'new-sale') {
        const workflow = await page.locator('.sale-workflow').boundingBox();
        const summary = await page.locator('.sale-checkout-summary').boundingBox();
        expect(workflow).not.toBeNull();
        expect(summary).not.toBeNull();
        if (width === 1280) expect(summary!.x).toBeGreaterThan(workflow!.x);
        else expect(summary!.y).toBeGreaterThan(workflow!.y);
      }
      if (view.slug === 'inventory') {
        const table = page.locator('.data-table-scroll.inventory-table-wrap');
        await expect(table).toHaveAttribute('tabindex', '0');
        expect(await table.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(width === 760);
      }
      await assertNoDocumentOverflow();
      if (width === 1280 || ['overview', 'new-sale', 'inventory', 'reports'].includes(view.slug)) await capture(view.slug, width);
    }
  }

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByLabel('Business name')).toHaveValue(businessName);
  await page.getByRole('button', { name: 'Create manual backup' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Manual backup created.' })).toBeVisible();
  const backupName = (await readdir(path.join(appDataPath, 'backups'))).find((name) => name.startsWith('manual-'))!;
  await expect(page.getByText('Last successful backup:')).toContainText(backupName);
  await expect(page.getByText('Last successful backup:').locator('span')).toHaveAttribute('title', backupName);
  await assertNoDocumentOverflow();

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Reports' }).click();
  await page.emulateMedia({ media: 'print' });
  expect(await page.locator('.sidebar').evaluate((element) => getComputedStyle(element).display)).toBe('none');
  expect(await page.locator('.topbar').evaluate((element) => getComputedStyle(element).display)).toBe('none');
  expect(await page.locator('.report-filters').evaluate((element) => getComputedStyle(element).display)).toBe('none');
  expect(await page.locator('.data-table-scroll').first().evaluate((element) => getComputedStyle(element).overflowX)).toBe('visible');
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
  await page.emulateMedia({ media: 'screen', reducedMotion: 'reduce' });
  expect(await page.getByRole('button', { name: 'Print report' }).evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('1e-05s');
  expect(remoteRequests).toEqual([]);
});

test('keyboard navigation and Escape keep destructive actions canceled', async () => {
  await completeSampleSetup('Keyboard cart', 'Main cart');
  const navigation = page.getByRole('navigation', { name: 'Primary' });
  await page.keyboard.press('Tab');
  await expect(navigation.getByRole('button', { name: 'Overview' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(navigation.getByRole('button', { name: 'New sale' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(navigation.getByRole('button', { name: 'Overview' })).toBeFocused();
  await navigation.getByRole('button', { name: 'Products' }).click();
  const primaryAction = page.getByRole('button', { name: 'Add product' }).first();
  await expect(primaryAction).toBeVisible();
  for (let step = 0; step < 16 && !(await primaryAction.evaluate((element) => element === document.activeElement)); step += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(primaryAction).toBeFocused();
  const product = (await bridge<Array<{ id: string; name: string }>>('listProducts'))[0]!;
  const trigger = page.getByRole('button', { name: `Archive ${product.name}` });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: `Archive ${product.name}?` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  for (const key of ['Tab', 'Shift+Tab', 'Tab']) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect((await bridge<Array<{ id: string }>>('listProducts')).some((item) => item.id === product.id)).toBe(true);
});
