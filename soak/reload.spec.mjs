// Triage: separate a submit-click race from loss of an accepted durable outbox save.
import { test, expect, signIn, signInAgain, synced, uniq, APP, db } from '../e2e/fixtures.mjs';

test('an accepted offline save survives a reload before its slow upload', async ({ phone, browserName }) => {
  test.setTimeout(300_000);
  const a = await phone(), b = await phone();
  const { email } = await signIn(a, 'member');
  await signInAgain(b, email);
  await synced(a);
  let cdp;
  if (browserName === 'chromium') {
    cdp = await a.context().newCDPSession(a);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 2000,
      downloadThroughput: 500 * 1000 / 8, uploadThroughput: 50 * 1000 / 8 });
  }
  const text = uniq('accepted-reload');
  await a.context().setOffline(true);
  await a.fill('#new-text', text);
  await a.click('#add button[type=submit]');
  // The app clears this field only after its save promise resolves. An optimistic row alone is too early.
  await expect(a.locator('#new-text')).toHaveValue('');
  await expect(a.locator('#items')).toContainText(text);
  await expect.poll(() => a.evaluate(() => window.starter.status)).not.toBe('synced');
  await a.context().setOffline(false);
  if (cdp) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 2000,
    downloadThroughput: 500 * 1000 / 8, uploadThroughput: 50 * 1000 / 8 });
  await a.reload({ waitUntil: 'commit' });
  await expect(a.locator('#list-view')).toBeVisible({ timeout: 180_000 });
  if (cdp) await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await expect.poll(async () => (await db.list('spaces/_/items')).filter(d => !d._deleted && d.text === text).length,
    { timeout: 120_000, message: 'accepted save reaches backend exactly once' }).toBe(1);
  for (const p of [a, b]) {
    await expect(p.getByRole('button', { name: text, exact: true })).toHaveCount(1, { timeout: 60_000 });
    await expect.poll(() => p.evaluate(() => window.starter.status), { timeout: 60_000 }).toBe('synced');
    await expect(p.locator('#status')).toHaveAttribute('data-state', 'synced');
  }
});
