import { expect, test, type Page } from '@playwright/test';
import { open } from './helpers';

/** Explicit viewports: at, between, and either side of every breakpoint. */
const WIDTHS = [320, 360, 390, 430, 640, 768, 900, 940, 1023, 1024, 1180, 1280, 1536, 1920];
const LG = 1024;

interface Row {
  width: number;
  overflowPx: number;
  menu: string;
  controlsInView: string;
  overlaps: number;
  smallTargets: number;
  logoRatio: string;
  ok: boolean;
}

type Box = { x: number; y: number; width: number; height: number };
const intersects = (a: Box, b: Box) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

async function measure(page: Page, width: number): Promise<{ row: Row; problems: string[] }> {
  const problems: string[] = [];
  const overflowPx = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflowPx > 0) problems.push(`horizontal overflow ${overflowPx}px`);

  // Required controls: the hamburger below lg, the inline actions at lg+, the view switcher,
  // the conflict count, and the scope filter. Each must be visible and fully inside the viewport.
  const required = [
    width < LG ? page.getByRole('button', { name: 'Open menu' }) : page.getByRole('navigation', { name: 'Data actions' }),
    page.getByRole('group', { name: 'Calendar view' }),
    page.getByRole('button', { name: 'Regular calendar' }),
    page.getByLabel('Team'),
    width < LG ? page.getByRole('button', { name: /conflicts? in view/ }) : page.locator('p', { hasText: /conflicts? in view/ }),
  ];
  let inView = 0;
  for (const loc of required) {
    const b = await loc.boundingBox();
    if (b && (await loc.isVisible()) && b.x >= 0 && b.x + b.width <= width + 0.5) inView += 1;
    else problems.push(`required control not fully in view: ${loc}`);
  }

  // No overlaps among header and toolbar controls.
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('header button, header nav button, header h1, [role=group][aria-label="Calendar view"] button, #scope-team, main button.btn, .no-print button')]
      .filter((e) => (e as HTMLElement).offsetParent !== null && !e.closest('[role=dialog]'))
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { name: (e.textContent || e.getAttribute('aria-label') || e.id).trim().slice(0, 30), x: r.x, y: r.y, width: r.width, height: r.height };
      }),
  );
  let overlaps = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (intersects(boxes[i]!, boxes[j]!)) {
        overlaps += 1;
        problems.push(`overlap: "${boxes[i]!.name}" and "${boxes[j]!.name}"`);
      }
    }
  }

  // Tap targets outside the calendar grid must be at least 44x44 (hit area, incl. ::after expansion).
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button, select, input, [role=button], a[href]')]
      .filter((e) => (e as HTMLElement).offsetParent !== null && !e.closest('.fc-view-harness') && !e.closest('[data-track]'))
      .map((e) => {
        const r = e.getBoundingClientRect();
        const after = getComputedStyle(e, '::after');
        const w = Math.max(r.width, after.content !== 'none' ? parseFloat(after.width) || 0 : 0);
        const h = Math.max(r.height, after.content !== 'none' ? parseFloat(after.height) || 0 : 0);
        return { name: (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30), w, h };
      })
      .filter((t) => t.w < 43.5 || t.h < 43.5),
  );
  for (const s of small) problems.push(`small target ${s.w.toFixed(0)}x${s.h.toFixed(0)}: "${s.name}"`);

  // The logo keeps its square aspect ratio.
  const logo = (await page.locator('header svg').first().boundingBox())!;
  const ratio = logo.width / logo.height;
  if (Math.abs(ratio - 1) > 0.01) problems.push(`logo ratio ${ratio.toFixed(2)}`);

  return {
    row: {
      width,
      overflowPx,
      menu: width < LG ? 'hamburger' : 'inline',
      controlsInView: `${inView}/${required.length}`,
      overlaps,
      smallTargets: small.length,
      logoRatio: ratio.toFixed(2),
      ok: problems.length === 0,
    },
    problems,
  };
}

test('layout QA across 14 viewport widths', async ({ browser }) => {
  test.setTimeout(240_000);
  const rows: Row[] = [];
  const allProblems: string[] = [];
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < LG, timezoneId: 'America/New_York' });
    const page = await ctx.newPage();
    await open(page);
    await page.waitForTimeout(300);
    const { row, problems } = await measure(page, width);
    await page.screenshot({ path: `qa-output/layout-${width}.png`, fullPage: false });

    // Overlays: the menu (below lg) and the conflict slide-over close on Escape and on an
    // outside click, and return focus to the control that opened them.
    if (width < LG) {
      const burger = page.getByRole('button', { name: 'Open menu' });
      await burger.click();
      await expect(page.locator('#data-menu')).toBeVisible();
      const menuBox = (await page.locator('#data-menu').boundingBox())!;
      if (menuBox.x < 0 || menuBox.x + menuBox.width > width + 0.5) problems.push('menu panel outside viewport');
      await page.screenshot({ path: `qa-output/layout-${width}-menu.png` });
      await page.keyboard.press('Escape');
      await expect(page.locator('#data-menu')).toHaveCount(0);
      await expect(burger).toBeFocused();
      await burger.click();
      await page.mouse.click(5, 880);
      await expect(page.locator('#data-menu')).toHaveCount(0);

      const count = page.getByRole('button', { name: /conflicts? in view/ });
      await count.click();
      const sheet = page.getByRole('dialog', { name: /Conflicts/ });
      await expect(sheet).toBeVisible();
      const sb = (await sheet.boundingBox())!;
      if (sb.x < -0.5 || sb.x + sb.width > width + 0.5) problems.push('conflict sheet outside viewport');
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      await expect(count).toBeFocused();
    }
    for (const p of problems) allProblems.push(`${width}px: ${p}`);
    rows.push({ ...row, ok: problems.length === 0 });
    await ctx.close();
  }

  console.log('\nLayout QA summary');
  console.table(rows);
  if (allProblems.length) console.log(allProblems.join('\n'));
  expect(allProblems).toEqual([]);
});
