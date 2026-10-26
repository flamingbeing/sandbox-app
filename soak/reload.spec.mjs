// Triage: separate a submit-click race from loss of an accepted durable outbox save.
import { test, expect, signIn, signInAgain, synced, uniq, APP, db } from '../e2e/fixtures.mjs';

test('accepted offline add, edit and delete survive reloads before slow uploads', async ({ phone, browserName }) => {
  test.setTimeout(300_000);
  const a = await phone(), b = await phone();
  const { email } = await signIn(a, 'member');
  await signInAgain(b, email);
  for (const p of [a, b]) {
    await p.goto(APP + '&sw');
    await expect.poll(() => p.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 60_000 }).toBe(true);
  }
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
  // Repeat for edits and deletes, waiting for the app's post-save acknowledgement each time.
  const edited = text + '-edited';
  for (const action of ['edit', 'delete']) {
    await a.context().setOffline(true);
    await a.getByRole('button', { name: action === 'edit' ? text : edited, exact: true }).click();
    if (action === 'edit') {
      await a.fill('#edit-text', edited);
      await a.click('#edit-save');
      await expect(a.locator('#toasts')).toContainText('Saved');
    } else {
      await a.click('#edit-delete');
      await a.getByRole('button', { name: 'Delete', exact: true }).last().click();
      await expect(a.locator('#toasts')).toContainText('Deleted');
    }
    await a.context().setOffline(false);
    if (cdp) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 2000,
      downloadThroughput: 500 * 1000 / 8, uploadThroughput: 50 * 1000 / 8 });
    await a.reload({ waitUntil: 'commit' });
    await expect(a.locator('#list-view')).toBeVisible({ timeout: 180_000 });
    if (cdp) await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const expected = action === 'edit' ? [edited] : [];
    await expect.poll(async () => (await db.list('spaces/_/items'))
      .filter(d => !d._deleted && d.text?.startsWith(text)).map(d => d.text).sort(),
      { timeout: 120_000, message: `accepted ${action} reaches backend` }).toEqual(expected);
    for (const p of [a, b]) {
      await expect(p.getByRole('button', { name: text, exact: true })).toHaveCount(0);
      await expect(p.getByRole('button', { name: edited, exact: true })).toHaveCount(expected.length, { timeout: 60_000 });
      await expect.poll(() => p.evaluate(() => window.starter.status), { timeout: 60_000 }).toBe('synced');
      await expect(p.locator('#status')).toHaveAttribute('data-state', 'synced');
    }
  }

});
