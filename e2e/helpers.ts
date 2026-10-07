import type { Page } from '@playwright/test';
import { generateSeed } from '../src/data/seed/generate';

/** Fixed "now" so the seed (anchored to the current week) is the same on every run. */
export const NOW = new Date('2026-10-07T12:00:00Z');
export const seed = () => generateSeed({ anchor: NOW });

export async function open(page: Page, path = '') {
  await page.clock.setFixedTime(NOW);
  await page.goto(path);
  await page.getByRole('heading', { name: 'Release Control Tower' }).waitFor();
}

/** Drag the element to the target using real pointer events. */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 5, from.y + 5, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}
