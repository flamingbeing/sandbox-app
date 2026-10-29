// Back with tabs (app-ui tabBack): switching tabs adds at most one history step; Back on another tab goes to the
// first tab; Back on the first tab shows "Press Back again to close"; a second Back within 2 s leaves.
import { test, expect, signIn } from './fixtures.mjs';

const current = page => page.locator('.ui-tabbar .ui-tab[aria-current="page"]');

test('tabs add at most one Back step; Back goes to the first tab, then leaves', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await expect(current(page)).toHaveText(/Today/);
  const before = await page.evaluate(() => history.length);

  for (const name of ['Upcoming', 'Done', 'Settings']) {
    await page.locator('.ui-tabbar .ui-tab', { hasText: name }).click();
    await expect(current(page)).toHaveText(new RegExp(name));
  }
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(before + 1);

  await page.goBack();
  await expect(current(page)).toHaveText(/Today/);

  const app = page.url();
  // rc.50: the first Back on the first tab asks once; a second within 2 s leaves
  await page.goBack();
  await expect(page.getByText('Press Back again to close')).toBeVisible();
  expect(page.url()).toBe(app);
  const left = await page.goBack();
  expect(left === null || page.url() !== app).toBe(true);
});
