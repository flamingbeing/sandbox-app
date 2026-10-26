// Soak: 3 phones on one list, random adds / edits / deletes / "toggles" (the app has no checkbox, so a toggle appends or
// removes a " ✓" mark through the edit sheet), offline blips (1-30 s) and reloads. Seeded; every action is logged.
// Run: SEED=1 SOAK_MINUTES=10 npx playwright test soak/multidevice.spec.mjs --workers 1 --project phone
// Logs go to SOAK_LOG_DIR (default TEMP), never into git. Made-up data only; emulator only (demo- project).
// UNVERIFIED: written without being able to run it (job had no shell); expect selector fixes on first run.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { test, expect, signIn, signInAgain, synced, uniq, APP, db } from '../e2e/fixtures.mjs';

const SEED = Number(process.env.SEED || 1);
const MINUTES = Number(process.env.SOAK_MINUTES || 10);
const LOG_DIR = process.env.SOAK_LOG_DIR || process.env.TEMP || os.tmpdir();

function rng(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test(`3 phones, one list, ${MINUTES} min, seed ${SEED}`, async ({ phone, browserName }) => {
  test.setTimeout((MINUTES + 10) * 60_000);
  const rand = rng(SEED), int = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const logFile = path.join(LOG_DIR, `soak-multidevice-${browserName}-seed${SEED}.log`);
  const t0 = Date.now();
  const log = m => fs.appendFileSync(logFile, `${((Date.now() - t0) / 1000).toFixed(1)}s ${m}\n`);
  fs.writeFileSync(logFile, `seed ${SEED} browser ${browserName} minutes ${MINUTES}\n`);

  const pages = [await phone(), await phone(), await phone()];
  const { email } = await signIn(pages[0], 'member');
  await signInAgain(pages[1], email);
  await signInAgain(pages[2], email);
  const offline = [false, false, false], backOnlineAt = [0, 0, 0];
  const tag = uniq('soak');
  let n = 0;
  const texts = p => p.locator('#items li button').allTextContents();
  const mine = async p => (await texts(p)).filter(t => t.startsWith(tag));

  async function resolveAttention(p, i) {   // a conflict waits for a choice: pick one at random
    if (!(await p.locator('#attention').isVisible().catch(() => false))) return;
    log(`p${i} conflict -> ${rand() < 0.5 ? 'mine' : 'theirs'}`);
    await p.click('#attention');
    const name = rand() < 0.5 ? 'Keep mine' : 'Keep theirs';
    for (let k = 0; k < 20 && await p.getByRole('button', { name }).count(); k++) {
      await p.getByRole('button', { name }).first().click();
      await p.waitForTimeout(200);
    }
    await p.keyboard.press('Escape').catch(() => {});
  }

  const end = Date.now() + MINUTES * 60_000;
  try {
    while (Date.now() < end) {
      const i = int(0, 2), p = pages[i], r = rand();
      try {
        if (r < 0.30) {
          const t = `${tag}-${++n}-p${i}`;
          log(`p${i} add ${t}`);
          await p.fill('#new-text', t); await p.click('#add button[type=submit]');
        } else if (r < 0.50 || r < 0.60) {   // edit (0.50-0.60 is the toggle)
          const list = await mine(p);
          if (list.length) {
            const old = list[int(0, list.length - 1)];
            const toggle = r >= 0.50;
            const next = toggle ? (old.endsWith(' ✓') ? old.slice(0, -2) : old + ' ✓') : `${old.replace(/ e\d+$/, '')} e${++n}`;
            log(`p${i} ${toggle ? 'toggle' : 'edit'} ${old} -> ${next}`);
            await p.getByRole('button', { name: old, exact: true }).click({ timeout: 5000 });
            await p.fill('#edit-text', next); await p.click('#edit-save');
          }
        } else if (r < 0.72) {
          const list = await mine(p);
          if (list.length) {
            const old = list[int(0, list.length - 1)];
            log(`p${i} delete ${old}`);
            await p.getByRole('button', { name: old, exact: true }).click({ timeout: 5000 });
            await p.click('#edit-delete');
            const confirm = p.getByRole('button', { name: /^(delete|yes)/i });   // in case the app asks to confirm
            if (await confirm.count()) await confirm.first().click().catch(() => {});
          }
        } else if (r < 0.82) {
          if (!offline[i]) {
            const s = int(1, 30);
            log(`p${i} offline ${s}s`);
            await p.context().setOffline(true); offline[i] = true; backOnlineAt[i] = Date.now() + s * 1000;
          }
        } else if (r < 0.88) {
          log(`p${i} reload`);
          await p.reload();
          await expect(p.locator('#list-view')).toBeVisible({ timeout: 20_000 });
        }
        for (let k = 0; k < 3; k++) if (offline[k] && Date.now() >= backOnlineAt[k]) {
          await pages[k].context().setOffline(false); offline[k] = false; log(`p${k} online`);
        }
        await resolveAttention(p, i);
      } catch (e) {
        log(`p${i} action failed (UI raced a redraw?): ${String(e.message).split('\n')[0]}`);
      }
      await p.waitForTimeout(int(100, 1500));
    }

    // settle: everyone online, conflicts answered, all synced
    for (let k = 0; k < 3; k++) { await pages[k].context().setOffline(false); offline[k] = false; }
    log('settling');
    for (let round = 0; round < 6; round++) {
      for (let k = 0; k < 3; k++) await resolveAttention(pages[k], k);
      await pages[0].waitForTimeout(2000);
    }
    for (const p of pages) await synced(p);

    const backend = (await db.list('spaces/_/items')).map(d => d.text).filter(t => t.startsWith(tag)).sort();
    const views = [];
    for (const p of pages) views.push((await mine(p)).sort());
    log(`backend ${JSON.stringify(backend)}`);
    views.forEach((v, k) => log(`p${k} ${JSON.stringify(v)}`));
    for (let k = 0; k < 3; k++) expect(views[k], `phone ${k} list vs backend (seed ${SEED})`).toEqual(backend);
  } catch (e) {
    log(`FAIL ${e.message}`);
    for (const [k, p] of pages.entries()) await p.screenshot({ path: path.join(LOG_DIR, `soak-${browserName}-seed${SEED}-p${k}.png`) }).catch(() => {});
    throw e;
  }
});
