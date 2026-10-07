import { expect, test } from '@playwright/test';
import { drag, open, seed } from './helpers';

test.use({ viewport: { width: 1280, height: 900 } });

test('seed data shows exactly the eight planted conflicts, one panel entry each', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('status').filter({ hasText: 'Synthetic demo data' })).toBeVisible();
  const panel = page.getByRole('complementary', { name: 'Conflict panel' });
  await expect(panel.getByRole('heading', { name: /Conflicts \(8\)/ })).toBeVisible();
  const items = panel.locator('ol > li');
  await expect(items).toHaveCount(8);
  const rules = await items.locator('span.text-sm.font-semibold').allInnerTexts();
  expect(rules.sort()).toEqual(
    [
      'Dependency order',
      'Environment double-booking',
      'Guardrail violation',
      'Guardrail violation',
      'Guardrail violation',
      'Incomplete change request',
      'Time overlap',
      'Time overlap',
    ].sort(),
  );
});

test('dragging a release into the blackout raises a guardrail conflict at once and offers an alternative', async ({ page }) => {
  // A production Standard change on 6 Nov (Friday), dragged onto 11 Nov (inside the quarter-close blackout).
  const ds = seed();
  const target = ds.releases.find(
    (r) => r.environmentId === 'env-prod' && r.changeClass === 'standard' && r.startAt.startsWith('2026-11-0') && !r.id.startsWith('rel-p'),
  )!;
  expect(target, 'seed has a prod standard release in early November').toBeTruthy();

  await open(page);
  await page.getByRole('button', { name: 'Next month' }).click();
  const strip = page.locator('.fc-daygrid-event', { hasText: target.title.slice(0, 12) }).first();
  const box = (await strip.boundingBox())!;
  const cell = (await page.locator('td.fc-daygrid-day[data-date="2026-11-11"] .fc-daygrid-day-frame').boundingBox())!;
  await drag(page, { x: box.x + 30, y: box.y + box.height / 2 }, { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 });

  const whatIf = page.getByRole('region', { name: /What-if/ });
  await expect(whatIf).toBeVisible();
  await expect(whatIf).toContainText('1 new');
  await expect(whatIf).toContainText('Quarter-end financial close');
  const panel = page.getByRole('complementary', { name: 'Conflict panel' });
  await expect(panel.getByRole('heading', { name: /Conflicts \(9\)/ })).toBeVisible();
  const entry = panel.locator('ol > li', { hasText: target.title });
  await expect(entry.getByRole('button', { name: /^Move to / }).first()).toBeVisible();
  await page.screenshot({ path: 'qa-output/whatif-blackout.png' });

  // Apply the first alternative: the guardrail conflict goes away again.
  await entry.getByRole('button', { name: /^Move to / }).first().click();
  await expect(panel.getByRole('heading', { name: /Conflicts \(8\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Keep change' }).click();
  await expect(page.getByText(/Last change: Move/)).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).last().click();
  await expect(page.getByText(/Last change/)).toHaveCount(0);
});

test('moving a release that others depend on shows the ripple effect', async ({ page }) => {
  const ds = seed();
  // A chain root with at least two levels of dependents.
  const dependents = (id: string) => ds.dependencies.filter((d) => d.dependsOnReleaseId === id).map((d) => d.releaseId);
  const root = ds.releases.find((r) => dependents(r.id).some((c) => dependents(c).length > 0) && !ds.dependencies.some((d) => d.releaseId === r.id))!;
  const child = ds.releases.find((r) => r.id === dependents(root.id)[0])!;
  const grandchild = ds.releases.find((r) => r.id === dependents(child.id)[0])!;

  await open(page);
  await page.getByRole('button', { name: 'Timeline by team' }).click();
  // Find the root strip by its accessible name, navigating forward week by week.
  const strip = page.getByRole('button', { name: new RegExp(`^${root.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},`) });
  for (let i = 0; i < 8 && !(await strip.count()); i++) await page.getByRole('button', { name: 'Next week' }).click();
  await strip.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Push the root past both dependents.
  const later = new Date(Date.parse(grandchild.endAt) + 24 * 3600_000);
  const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T14:00`;
  const end = new Date(later.getTime());
  end.setDate(end.getDate() + 1);
  await dialog.getByLabel('End').fill(local(end));
  await dialog.getByLabel('Start').fill(local(later));
  await dialog.getByRole('button', { name: 'Preview impact' }).click();
  await expect(dialog.getByText(/This change adds/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  const whatIf = page.getByRole('region', { name: /What-if/ });
  await expect(whatIf).toContainText('Ripple effect');
  await expect(whatIf.getByRole('button', { name: child.title })).toBeVisible();
  await expect(whatIf.getByRole('button', { name: grandchild.title })).toBeVisible();
  await expect(whatIf).toContainText('now blocked');
  await expect(whatIf).toContainText('Dependency order');
  await whatIf.screenshot({ path: 'qa-output/whatif-ripple.png' });
});

test('regular view and integrated view share data and stay consistent', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Regular calendar' }).click();
  await page.getByLabel('Team').selectOption({ label: 'Checkout' });
  const panel = page.getByRole('complementary', { name: 'Conflict panel' });
  // Checkout owns the same-product overlap (planted conflict 1).
  await expect(panel.getByRole('heading', { name: /Conflicts \(1\)/ })).toBeVisible();
  await expect(panel).toContainText('Checkout Web 5.2');

  // Fix it from the regular view, then check the integrated view sees the same change.
  await panel.getByRole('button', { name: /^Move to / }).first().click();
  await page.getByRole('button', { name: 'Keep change' }).click();
  await expect(panel.getByRole('heading', { name: /Conflicts \(0\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Regular calendar' }).click();
  await expect(page.getByLabel('Team')).toHaveValue('');
  await expect(panel.getByRole('heading', { name: /Conflicts \(7\)/ })).toBeVisible();
});

test('the release drawer edits the RFC and shows completeness warnings', async ({ page }) => {
  await open(page);
  const panel = page.getByRole('complementary', { name: 'Conflict panel' });
  const entry = panel.locator('ol > li', { hasText: 'Incomplete change request' });
  await entry.getByRole('button', { name: /Data Lake Pipelines schema v9/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/needs a rollback plan/)).toBeVisible();
  await dialog.getByLabel(/Rollback plan/).fill('Restore the v8 schema snapshot.');
  await expect(dialog.getByText(/needs a rollback plan/)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Preview impact' }).click();
  await expect(dialog.getByText(/resolves/)).toContainText('1');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(panel.getByRole('heading', { name: /Conflicts \(7\)/ })).toBeVisible();
});

test('ITIL change-class badge explains itself on focus', async ({ page }) => {
  await open(page);
  const panel = page.getByRole('complementary', { name: 'Conflict panel' });
  await panel.locator('ol > li').first().getByRole('button').first().click();
  const badge = page.getByRole('dialog').getByRole('button', { name: /change$/ }).first();
  await badge.focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await expect(page.getByRole('tooltip')).toContainText(/pre-approved|risk-assessed|critical outage/);
  await page.keyboard.press('Escape');
});

test('month view shades only the part of a day a window covers', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Next month' }).click();
  // The quarter-close blackout starts Tue 10 Nov 19:00 New York time: 10 Nov is shaded from ~79% of the cell.
  const first = page.locator('td.fc-daygrid-day[data-date="2026-11-10"] .fc-bg-event.band-blackout');
  await expect(first).toHaveClass(/band-partial/);
  const from = await first.evaluate((el) => parseFloat((el as HTMLElement).style.getPropertyValue('--from')));
  expect(from).toBeCloseTo((19 / 24) * 100, 0);
  const full = page.locator('td.fc-daygrid-day[data-date="2026-11-11"] .fc-bg-event.band-blackout');
  await expect(full).not.toHaveClass(/band-partial/);
});

