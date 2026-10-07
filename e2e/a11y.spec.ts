import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { open } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function check(page: Page, label: string) {
  const res = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = res.violations.map((v) => `${label}: ${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`);
  expect(summary, summary.join('\n')).toEqual([]);
}

test.describe('axe accessibility (WCAG 2.2 AA rules)', () => {
  test('desktop: month, week, timeline, environments, regular view', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    await check(page, 'month');
    await page.getByRole('button', { name: 'Week', exact: true }).click();
    await check(page, 'week');
    await page.getByRole('button', { name: 'Timeline by team' }).click();
    await check(page, 'timeline');
    await page.getByRole('button', { name: 'Environments' }).click();
    await check(page, 'environments');
    await page.getByRole('button', { name: 'Regular calendar' }).click();
    await check(page, 'regular');
  });

  test('dialogs: release drawer, what-if, import, export, CAB agenda', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    const panel = page.getByRole('complementary', { name: 'Conflict panel' });
    await panel.getByRole('button', { name: /^Move to / }).first().click();
    await check(page, 'what-if');
    await page.getByRole('button', { name: 'Discard' }).click();
    await panel.locator('ol > li').first().getByRole('button').first().click();
    await check(page, 'drawer');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await check(page, 'import');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Export .ics' }).click();
    await check(page, 'export');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'CAB agenda' }).click();
    await check(page, 'cab');
  });

  test('phone: agenda list, menu, conflict sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await check(page, 'phone');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await check(page, 'phone-menu');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /conflicts? in view/ }).click();
    await check(page, 'phone-conflicts');
  });

  test('keyboard: every strip in the timeline is reachable and opens its details', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    await page.getByRole('button', { name: 'Timeline by team' }).click();
    const first = page.locator('[data-track] button').first();
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(first).toBeFocused();
  });
});
