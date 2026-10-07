import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { open } from './helpers';

test.use({ viewport: { width: 1280, height: 900 } });

test('CSV import: the downloaded template loads, and bad rows are rejected with clear messages', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Clear and start empty' }).click();
  await expect(page.getByRole('heading', { name: 'No releases scheduled' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Synthetic demo data' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Import a schedule' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a schedule' });
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download CSV template' }).click();
  const template = await readFile((await (await download).path())!, 'utf8');

  const bad = `${template},Broken row,Web,Storefront,moon,2026-03-10 09:00,2026-03-10 08:00\n`;
  await dialog.locator('input[type=file]').setInputFiles({ name: 'schedule.csv', mimeType: 'text/csv', buffer: Buffer.from(bad) });
  await expect(dialog.getByText('4 rows found')).toBeVisible();
  await expect(dialog.locator('p', { hasText: /3 rows ready to import, 1 rejected/ })).toBeVisible();
  await expect(dialog.getByText('Row 5: environment "moon" is not dev, staging/UAT, or prod; end "2026-03-10 08:00" is not after start "2026-03-10 09:00".')).toBeVisible();
  await page.screenshot({ path: 'qa-output/import-review.png' });
  await dialog.getByRole('button', { name: 'Import 3 releases' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(/Last change: Import 3 releases from schedule.csv/)).toBeVisible();
  await page.getByLabel('Team').selectOption({ label: 'Web' });
  await expect(page.getByLabel('Team')).toHaveValue(/team-web/);
});

test('CSV import: unmatched columns can be mapped by hand', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a schedule' });
  const csv = 'Thing,Group,Svc,Where,From,Until\nHand-mapped,Web,Storefront,production,2026-10-20T14:00Z,2026-10-20T15:00Z\n';
  await dialog.locator('input[type=file]').setInputFiles({ name: 'odd.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(dialog.getByText(/Match a column to Title, Team, Product, Environment, End/)).toBeVisible();
  for (const [label, col] of [['Title', 'Thing'], ['Team', 'Group'], ['Product', 'Svc'], ['Environment', 'Where'], ['End', 'Until']]) {
    await dialog.getByLabel(new RegExp(`^${label}`)).first().selectOption(col);
  }
  await expect(dialog.locator('p', { hasText: /1 row ready to import/ })).toBeVisible();
});

test('.ics export downloads a valid calendar for one team', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Export .ics' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export calendar feed' });
  await dialog.getByLabel('Releases to include').selectOption({ label: 'Checkout' });
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: /Download .ics/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('releases-checkout.ics');
  const text = await readFile((await file.path())!, 'utf8');
  expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
  expect(text).toContain('X-WR-CALNAME:Releases: Checkout');
  expect(text).toContain('SUMMARY:Checkout Web 5.2 → Staging/UAT');
  expect(text.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
});

test('CAB agenda lists the week, the four roles, conflicts and risks, and prints cleanly', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'CAB agenda' }).click();
  await expect(page.getByRole('heading', { name: 'Change Advisory Board agenda' })).toBeVisible();
  await page.getByRole('button', { name: 'Next week' }).click();
  for (const role of ['Change Manager', 'Operations', 'Development', 'Business / Product']) {
    await expect(page.getByRole('rowheader', { name: role })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: /Normal changes for approval/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Conflicts to resolve' })).toBeVisible();
  await expect(page.getByText(/Environment double-booking/)).toBeVisible();
  await expect(page.getByText(/Time overlap/)).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'Print agenda' })).toBeHidden();
  await page.screenshot({ path: 'qa-output/cab-print.png', fullPage: true });
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Back to calendar' }).click();
  await expect(page.getByRole('button', { name: 'Month', exact: true })).toBeVisible();
});
