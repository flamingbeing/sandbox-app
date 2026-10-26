// Soak: 2-3 phones on one list, seeded random add/edit/delete/"toggle" (a done mark in the text) on a slow, flaky network.
// Run: npx playwright test -c soak/playwright.config.mjs soak/chaos.spec.mjs --project=chromium
// Browser: whatever the project uses (Chromium by default; WebKit if the base config offers it, e.g. --browser=webkit via
// PW's CLI). Slow-network emulation (CDP) is Chromium only; offline blips, reloads and close/reopen run on every browser.
// Each phone only edits and deletes the items it added, so the final state is exactly known (no conflict sheets).
// Made-up data only. Needs the emulators and e2e server the config starts.
import { test, expect, signIn, signInAgain, db, uniq, APP, snapshot } from './observe.mjs';
import fs from 'node:fs';
import path from 'node:path';

const SEEDS = (process.env.SOAK_SEEDS || '1,2,3,4,5,6,7,8,9,10').split(',').map(Number);
const STEPS = Number(process.env.SOAK_STEPS || 25);
const SCALE = Number(process.env.SOAK_TIME_SCALE || 1);   // blips of 1-60 s run at SCALE x real time (set 1 for full length)
const BOUNDARY = { 1: 14, 4: 2, 6: 14, 7: 4, 8: 23, 10: 15, 2: 25 };
test.skip(!!process.env.SOAK_FOCUS && fs.existsSync(path.join(process.env.TEMP, 'round3-pause')), 'Focused batch pause requested');

function rng(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const between = (r, lo, hi) => lo + r() * (hi - lo);
const sleep = ms => new Promise(res => setTimeout(res, ms));
async function guardDraft(page) {
  if (!process.env.SOAK_GUARD_QUICK_ADD) return;
  await expect.poll(() => page.evaluate(() => {
    const settled = new Set(window.__soakEvents.filter(e => ['save-resolve', 'save-reject'].includes(e.type)).map(e => e.call));
    return window.__soakEvents.filter(e => e.type === 'save-call' && !settled.has(e.call)).length;
  })).toBe(0);
}

async function throttle(page, r, browserName) {
  if (browserName !== 'chromium') return;
  const cdp = await page.context().newCDPSession(page);
  await Promise.race([cdp.send('Network.enable'), sleep(10_000).then(() => { throw new Error('CDP Network.enable timed out'); })]);
  cdp.soakConditions = {
    offline: false,
    latency: between(r, 300, 3000),
    downloadThroughput: between(r, 50, 500) * 1000 / 8,
    uploadThroughput: between(r, 50, 500) * 1000 / 8,
  };
  await cdp.send('Network.emulateNetworkConditions', cdp.soakConditions);
  return cdp;
}

for (const seed of SEEDS) {
  test(`chaos seed ${seed}`, async ({ phone, browserName }, testInfo) => {
    test.skip(!!process.env.SOAK_FOCUS && fs.existsSync(path.join(process.env.TEMP, 'round3-pause')), 'Focused batch pause requested');
    test.setTimeout(process.env.SOAK_FOCUS ? 120_000 : 900_000);
    const steps = process.env.SOAK_FOCUS ? BOUNDARY[seed] : STEPS;
    const r = rng(seed);
    const tag = uniq(`soak${seed}`);
    const n = 2 + Math.floor(r() * 2);   // 2 or 3 phones
    const pages = [], mine = [], sessions = [];         // mine[i]: Map text -> true for items phone i currently should have
    const first = await phone();
    const { email } = await signIn(first, 'member');
    pages.push(first);
    for (let i = 1; i < n; i++) { const p = await phone(); await signInAgain(p, email); pages.push(p); }
    // Use the production offline-shell path; warm it before slowing backend traffic.
    for (const p of pages) {
      await p.goto(APP + '&sw');
      await expect.poll(() => p.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 60_000 }).toBe(true);
      await expect.poll(() => p.evaluate(() => window.starter.ready), { timeout: 30_000 }).toBe(true);
    }
    for (const p of pages) { sessions.push(await throttle(p, r, browserName)); mine.push(new Map()); }
    const everDeleted = new Set(), everAdded = new Set();
    let counter = 0;

    async function open(i) {   // (re)load phone i on the list
      await pages[i].goto(APP, { waitUntil: 'commit' });
      await expect(pages[i].locator('#list-view')).toBeVisible({ timeout: 180_000 });
    }

    for (let step = 0; step < steps; step++) {
      const i = Math.floor(r() * n);
      const page = pages[i], items = mine[i];
      const roll = r();
      console.log(`seed=${seed} step=${step} phone=${i} roll=${roll.toFixed(3)}`);
      const texts = [...items.keys()];
      try {
        if (roll < 0.40 || !texts.length) {
          const text = `${tag}-p${i}-${counter++}`;
          await guardDraft(page);
          await page.fill('#new-text', text);
          await page.click('#add button[type=submit]');
          items.set(text, true); everAdded.add(text);
        } else if (roll < 0.65) {   // edit
          const old = texts[Math.floor(r() * texts.length)];
          const text = `${old}e`;
          await page.getByRole('button', { name: old, exact: true }).click({ timeout: 10_000 });
          await page.fill('#edit-text', text);
          await page.click('#edit-save');
          items.delete(old); items.set(text, true); everAdded.add(text);
        } else if (roll < 0.80) {   // "toggle": flip a done mark
          const old = texts[Math.floor(r() * texts.length)];
          const text = old.endsWith('~') ? old.slice(0, -1) : `${old}~`;
          await page.getByRole('button', { name: old, exact: true }).click({ timeout: 10_000 });
          await page.fill('#edit-text', text);
          await page.click('#edit-save');
          items.delete(old); items.set(text, true); everAdded.add(text);
        } else {   // delete
          const old = texts[Math.floor(r() * texts.length)];
          await page.getByRole('button', { name: old, exact: true }).click({ timeout: 10_000 });
          await page.click('#edit-delete');
          await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
          items.delete(old); everDeleted.add(old);
        }
      } catch (e) {
        if (process.env.SOAK_TRACE && process.env.SOAK_SNAPSHOT !== '0') await snapshot(page, `seed=${seed} step=${step} failed-operation`);
        // a step that failed before its last click took no effect; one that failed after cannot be told apart here, so fail loudly
        await testInfo.attach('failed-operation-state', { contentType: 'application/json', body: JSON.stringify({
          seed, step, phone: i, expected: mine.map(m => [...m.keys()]),
          backend: (await db.list('spaces/_/items')).filter(d => d.text?.startsWith(tag)),
          phones: await Promise.all(pages.map(async p => ({
            status: await p.evaluate(() => window.starter?.status).catch(() => 'closed'),
            items: await p.locator('#items').innerText().catch(() => 'unavailable'),
          }))),
        }, null, 2) });
        throw new Error(`seed ${seed} step ${step} phone ${i} roll ${roll.toFixed(3)}: ${e.message}`);
      }

      // A narrowed prefix includes the original failing operation, then stops before unrelated later chaos.
      if (process.env.SOAK_FOCUS && step === steps - 1) break;
      // chaos between steps
      // Every seed covers reload, unsent close/reopen, and a full offline blip.
      const c = step === 0 ? 0.20 : step === 1 ? 0.30 : step === 2 ? 0.10 : r();
      if (c < 0.15) {                          // offline blip
        await page.context().setOffline(true);
        const blip = between(r, 1, 60) * 1000 * SCALE;
        console.log(`seed=${seed} offline-ms=${Math.round(blip)}`);
        await sleep(blip);
        await page.context().setOffline(false);
        if (sessions[i]) await sessions[i].send('Network.emulateNetworkConditions', sessions[i].soakConditions);
      } else if (c < 0.25) {                   // reload straight after a save (mid-save)
        if (process.env.SOAK_TRACE && process.env.SOAK_SNAPSHOT !== '0') await snapshot(page, `seed=${seed} step=${step} before-reload`);
        await page.reload({ waitUntil: 'commit' });
        await expect(page.locator('#list-view')).toBeVisible({ timeout: 180_000 });
      } else if (c < 0.32) {                   // close and reopen while saves may be unsent
        // Triage A/B independently of C. No wait is added before an immediate reload.
        await guardDraft(page);
        await page.context().setOffline(true);
        // Guarantee a durable unsent save before this phone is closed.
        const pending = `${tag}-p${i}-pending${counter++}`;
        await page.fill('#new-text', pending);
        await page.click('#add button[type=submit]');
        await expect(page.locator('#items')).toContainText(pending);
        await expect.poll(() => page.evaluate(() => window.starter.status)).not.toBe('synced');
        mine[i].set(pending, true); everAdded.add(pending);
        if (process.env.SOAK_TRACE && process.env.SOAK_SNAPSHOT !== '0') await snapshot(page, `seed=${seed} step=${step} before-close`);
        const again = await page.context().newPage();
        await page.close();
        pages[i] = again;
        const blip = between(r, 1, 60) * 1000 * SCALE;
        console.log(`seed=${seed} offline-ms=${Math.round(blip)}`);
        await sleep(blip);
        await again.context().setOffline(false);
        await open(i);
        sessions[i] = await throttle(again, r, browserName);
      }
    }

    // settle: everyone online, wait for every chip to say synced
    for (const p of pages) await p.context().setOffline(false);
    for (const cdp of sessions) if (cdp) await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
    });
    const expected = new Set(mine.flatMap(m => [...m.keys()]));
    await testInfo.attach('oracle', { contentType: 'application/json', body: JSON.stringify({ seed, expected: [...expected] }) });
    for (const p of process.env.SOAK_STATUS === 'observe' ? [] : pages) {
      await expect.poll(() => p.evaluate(() => window.starter.status), { timeout: 120_000, message: 'status chip ends synced' }).toBe('synced');
    }

    if (process.env.SOAK_TRACE && process.env.SOAK_SNAPSHOT !== '0') for (const p of pages) await snapshot(p, `seed=${seed} final`);
    const rows = async () => (await db.list('spaces/_/items')).filter(d => !d._deleted).map(d => d.text).filter(t => t?.startsWith(tag));
    await expect.poll(async () => [...new Set(await rows())].sort().join('\n'), { timeout: 60_000, message: 'backend matches expected' }).toBe([...expected].sort().join('\n'));
    const server = await rows();
    expect(server.length, 'no duplicated save on the backend').toBe(new Set(server).size);

    for (let i = 0; i < n; i++) {
      await expect.poll(async () => {
        const t = await pages[i].locator('#items').innerText();
        return [...everAdded].filter(x => t.split('\n').some(l => l.trim() === x)).sort().join('\n');
      }, { timeout: 60_000, message: `phone ${i} matches backend` }).toBe([...expected].sort().join('\n'));
      const shown = (await pages[i].locator('#items').innerText()).split('\n').map(l => l.trim()).filter(l => l.startsWith(tag));
      expect(shown.length, `phone ${i} shows no duplicate`).toBe(new Set(shown).size);
      for (const d of everDeleted) expect(shown, `phone ${i}: deleted item gone`).not.toContain(d);
      if (process.env.SOAK_STATUS !== 'observe') await expect(pages[i].locator('#status')).toHaveAttribute('data-state', 'synced');
    }
    await testInfo.attach('data-equality-result', { contentType: 'application/json', body: JSON.stringify({
      seed, expected: [...expected], backend: server,
      chips: await Promise.all(pages.map(p => p.evaluate(() => window.starter.status))),
      fullStatusCheck: process.env.SOAK_STATUS !== 'observe',
    }) });
  });
}
