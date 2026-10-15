import { expect } from '@playwright/test';
import { test } from './web-fixtures';

// Removing IndexedDB writes, mobile navigation, or the precached shell must break this journey.
test('keeps a mobile ledger and its shell available after the production server stops', async ({ page, context, webServer }, testInfo) => {
  const errors: string[] = [];
  context.on('page', (opened) => opened.on('pageerror', (error) => errors.push(error.message)));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(webServer.origin);
  await expect(page.getByRole('heading', { name: 'Set up your business' })).toBeVisible();
  await page.getByLabel('Business name').fill('Mobile E2E Cart');
  await page.getByLabel('Location name').fill('Phone Cart');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('checkbox', { name: /Siomai Pork/ }).first().check();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('setup-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Continue to opening stock' }).click();
  await page.getByLabel('Opening pieces for Siomai Pork').fill('100');
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByRole('heading', { name: 'Today at a glance' })).toBeVisible();

  const rail = page.getByRole('navigation', { name: 'Mobile primary' });
  await rail.getByRole('button', { name: 'More', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'More destinations' });
  for (const destination of ['Replenish', 'Transfers', 'Stock count', 'Reports', 'Products', 'Locations', 'Import data', 'Settings']) {
    await expect(sheet.getByRole('button', { name: destination, exact: true })).toBeVisible();
  }
  await sheet.getByRole('button', { name: 'Products', exact: true }).click();
  await expect(sheet).toBeHidden();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Selling price per piece (pesos)').fill('25');
  await page.getByLabel('Selling price per pack (pesos)').fill('1500');
  await page.getByRole('button', { name: 'Save product' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Product saved.' })).toBeVisible();

  await rail.getByRole('button', { name: 'New sale', exact: true }).click();
  await page.getByLabel('Find a product').fill('Siomai Pork');
  await page.getByRole('button', { name: 'Add Siomai Pork (SIO-PORK)', exact: true }).click();
  await page.getByLabel('Quantity for Siomai Pork').fill('2');
  await page.getByLabel('Unit for Siomai Pork').selectOption('piece');
  await page.getByLabel('Amount tendered').fill('100');
  await page.getByRole('button', { name: 'Complete sale', exact: true }).click();
  const receipt = page.getByRole('region', { name: 'Receipt', exact: true });
  await expect(receipt).toContainText('Completed');
  await expect(receipt.getByRole('table', { name: 'Receipt items' })).toContainText('2 pieces');
  await expect(receipt.locator('.receipt-totals')).toHaveText(/Total₱50\.00Paid₱100\.00Change₱50\.00/);
  const saleId = (await receipt.locator('.eyebrow').textContent())!;

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today at a glance' })).toBeVisible();
  await rail.getByRole('button', { name: 'New sale', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Recent sales', exact: true })).toContainText(saleId.replace('Sale ', ''));
  await page.getByRole('button', { name: /View receipt/ }).click();
  await expect(receipt).toContainText(saleId);
  await expect(receipt.locator('.receipt-totals')).toContainText('₱50.00');
  await rail.getByRole('button', { name: 'More', exact: true }).click();
  await sheet.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByLabel('Business name')).toHaveValue('Mobile E2E Cart');

  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) throw new Error('The production build has no manifest');
    const response = await fetch(link.href);
    if (!response.ok) throw new Error(`Manifest returned ${response.status}`);
    return response.json();
  });
  expect(manifest).toMatchObject({ name: 'Siomai Inventory', display: 'standalone', start_url: './' });
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: '192x192', purpose: 'any maskable' }),
    expect.objectContaining({ sizes: '512x512', purpose: 'any maskable' }),
  ]));
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state)).toBe('activated');
  // The next navigation must be controlled before taking the origin away.
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe('activated');
  await expect(page.getByRole('heading', { name: 'Today at a glance' })).toBeVisible();

  await page.close();
  await webServer.stop();
  // Prove this is an unavailable server, not a browser HTTP-cache-only reload.
  await expect(fetch(webServer.origin)).rejects.toThrow();
  await context.setOffline(true);
  const offlinePage = await context.newPage();
  const offlineResponse = await offlinePage.goto(webServer.origin);
  expect(offlineResponse?.fromServiceWorker()).toBe(true);
  await expect(offlinePage.getByRole('heading', { name: 'Today at a glance' })).toBeVisible();
  await expect(offlinePage.getByRole('article', { name: 'Sales', exact: true })).toContainText('₱50.00');
  await expect(offlinePage.getByRole('article', { name: 'Items sold', exact: true })).toContainText('2 pc');
  const ledger = offlinePage.getByRole('table', { name: 'Daily inventory ledger' });
  await expect(ledger).toContainText('Siomai Pork');
  await expect(ledger.locator('[data-label="On hand"]')).toHaveText('98');
  const activity = offlinePage.getByRole('list', { name: 'Recent activity' });
  await expect(activity.locator('time')).toHaveCount(3);
  await expect(activity).not.toContainText('Invalid Date');
  await expect(offlinePage.getByLabel('Current location')).toHaveValue(/.+/);
  expect(await offlinePage.getByLabel('Current location').locator('option:checked').innerText()).toBe('Phone Cart');
  await offlinePage.screenshot({ path: testInfo.outputPath('overview-offline-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});
