// Minimal regression: the next draft must survive completion of an earlier async submit.
// Scheduling both user actions in one task pins the interleaving; no storage or save is mocked.
import { test, expect, signIn, synced, snapshot, uniq } from './observe.mjs';

test('C: completing the first offline add must preserve the next draft', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await page.context().setOffline(true);
  const first = uniq('first'), second = uniq('second');
  await page.evaluate(({ first, second }) => {
    const input = document.querySelector('#new-text');
    input.value = first;
    document.querySelector('#add').requestSubmit();
    input.value = second;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, { first, second });
  await expect.poll(() => page.evaluate(() => window.__soakEvents.filter(e => e.type === 'save-resolve').length)).toBe(1);
  const before = await snapshot(page, 'first-resolved-next-draft');
  expect(before.events.filter(e => e.type === 'save-call')).toHaveLength(1);
  // The earlier completion cleared the required field, so native validation blocks the next submit.
  await page.click('#add button[type=submit]');
  const after = await snapshot(page, 'second-submit');
  expect(after.events.filter(e => e.type === 'save-call'), 'the second draft must reach app-sync').toHaveLength(2);
  await expect(page.locator('#items')).toContainText(second);
});
