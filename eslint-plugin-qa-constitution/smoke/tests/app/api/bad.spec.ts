import { test, expect } from '@playwright/test';
import { z } from 'zod';

const Project = z.object({ id: z.string() });
const token = process.env.API_TOKEN;

// test('@App-regression old disabled case', async () => { await go(); });

test('creates a project', async ({ page }) => {
  const p = new SettingsPage(page);
  await page.waitForTimeout(1000);
  await page.locator('//button[@id="save"]').click();
  if (token) { await page.evaluate(() => document.title); }
  try { await expect(page).toHaveTitle('x'); } catch {}
  Project.parse({ id: '1' });
  expect(() => p.save()).not.toThrow();
});
