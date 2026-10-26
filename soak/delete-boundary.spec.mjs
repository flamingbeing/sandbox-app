// B without the preceding rapid-add race: reload immediately after the delete confirmation.
import { test, expect, signIn, synced, snapshot, uniq, APP, db } from './observe.mjs';

test('B: immediate confirmed delete survives reload with a pre-reload outbox read', async ({ phone }) => {
  test.setTimeout(180_000);
  const page = await phone();
  await signIn(page, 'member');
  await page.goto(APP + '&sw');
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.starter.ready)).toBe(true);
  const text = uniq('delete-boundary');
  await page.fill('#new-text', text);
  await page.click('#add button[type=submit]');
  await expect(page.locator('#new-text')).toHaveValue('');
  await expect.poll(async () => (await db.list('spaces/_/items')).filter(d => d.text === text).length).toBe(1);
  await synced(page);
  await page.context().setOffline(true);
  await page.getByRole('button', { name: text, exact: true }).click();
  await page.click('#edit-delete');
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
  // Deliberately do not wait for a toast or the save promise.
  await snapshot(page, 'delete-before-reload');
  await page.reload({ waitUntil: 'commit' });
  await expect(page.locator('#list-view')).toBeVisible();
  await page.context().setOffline(false);
  await expect.poll(async () => (await db.list('spaces/_/items')).filter(d => !d._deleted && d.text === text).length,
    { timeout: 60_000 }).toBe(0);
  await synced(page);
  await expect(page.getByRole('button', { name: text, exact: true })).toHaveCount(0);
});
