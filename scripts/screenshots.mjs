// Regenerate README screenshots: `npm run build && npx vite preview --port 4173 &` then `node scripts/screenshots.mjs`.
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:4173/release-control-tower/';
const NOW = new Date('2026-10-07T12:00:00Z');
const OUT = 'docs/screenshots';

const browser = await chromium.launch();
async function page(width, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: 'America/New_York', deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(NOW);
  await p.goto(BASE);
  await p.getByRole('heading', { name: 'Release Control Tower' }).waitFor();
  return p;
}

let p = await page(1440);
await p.screenshot({ path: `${OUT}/integrated-month.png` });
await p.getByRole('button', { name: 'Timeline by team' }).click();
await p.screenshot({ path: `${OUT}/timeline-by-team.png` });
await p.getByRole('button', { name: 'Environments' }).click();
await p.screenshot({ path: `${OUT}/environments.png` });
await p.close();

p = await page(1440);
await p.getByRole('button', { name: 'Next month' }).click();
const strip = p.locator('.fc-daygrid-event', { hasText: 'Pricing Engine' }).first();
const a = await strip.boundingBox();
const b = await p.locator('td.fc-daygrid-day[data-date="2026-11-11"] .fc-daygrid-day-frame').boundingBox();
await p.mouse.move(a.x + 30, a.y + a.height / 2);
await p.mouse.down();
await p.mouse.move(a.x + 40, a.y + 10, { steps: 3 });
await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
await p.mouse.up();
await p.getByRole('region', { name: /What-if/ }).waitFor();
await p.screenshot({ path: `${OUT}/what-if-blackout.png` });
await p.close();

p = await page(1280);
await p.getByRole('button', { name: 'CAB agenda' }).click();
await p.getByRole('button', { name: 'Next week' }).click();
await p.emulateMedia({ media: 'print' });
await p.screenshot({ path: `${OUT}/cab-agenda.png`, fullPage: true });
await p.close();

p = await page(390, 844);
await p.screenshot({ path: `${OUT}/phone.png` });
await p.close();

await browser.close();
console.log('screenshots written to', OUT);
