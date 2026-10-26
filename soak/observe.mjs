// Test-only trace. Only app-sync item databases are read; Firebase Auth storage is excluded.
import { test as base, expect, signIn, signInAgain, synced, uniq, APP, db } from '../e2e/fixtures.mjs';
import fs from 'node:fs';
import path from 'node:path';

export const test = base.extend({
  phone: async ({ phone }, use, info) => {
    const dir = info.outputPath('..');
    fs.mkdirSync(dir, { recursive: true });
    const log = path.join(dir, `evidence-${info.repeatEachIndex}-${info.title.replace(/[^a-z0-9]+/gi, '-')}.jsonl`);
    let sequence = 0;
    await use(async () => {
      const page = await phone();
      const phoneId = sequence++;
      await page.context().exposeBinding('__soakEmit', (source, event) => {
        fs.appendFileSync(log, JSON.stringify({ phone: phoneId, ...event }) + '\n');
      });
      await page.context().addInitScript(() => {
        window.__soakEvents = [];
        window.__soakTrace = event => {
          const entry = { at: performance.timeOrigin + performance.now(), ...event };
          if (!entry.type.startsWith('snapshot')) window.__soakEvents.push(entry);
          void window.__soakEmit(entry);
        };
        document.addEventListener('submit', e => {
          if (e.target.id === 'add') window.__soakTrace({ type: 'submit', text: document.querySelector('#new-text')?.value });
        }, true);
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        Object.defineProperty(HTMLInputElement.prototype, 'value', { ...descriptor, set(value) {
          if (this.id === 'new-text') window.__soakTrace({ type: 'input-set', before: descriptor.get.call(this), after: value });
          descriptor.set.call(this, value);
        } });
      });
      return page;
    });
  },
});

export async function snapshot(page, label) {
  return page.evaluate(async label => {
    const start = { label, type: 'snapshot-start', events: [...window.__soakEvents], input: document.querySelector('#new-text')?.value };
    window.__soakTrace(start);
    const databases = [];
    for (const { name } of await indexedDB.databases()) {
      if (!name || !(/-sync:|-outbox$/.test(name))) continue;
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const stores = {};
        // One transaction per database; wait for completion, not just getAll success.
        const names = [...database.objectStoreNames].filter(n => ['items', 'changes'].includes(n));
        if (names.length) await new Promise((resolve, reject) => {
          const tx = database.transaction(names, 'readonly');
          tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
          for (const n of names) {
            const request = tx.objectStore(n).getAll();
            request.onsuccess = () => { stores[n] = request.result.map(row => n === 'changes'
              ? { key: row.key, record: row.record, base: row.base, state: row.state, accepted: row.accepted }
              : { id: row.id, text: row.text, _deleted: row._deleted }); };
          }
        });
        databases.push({ name, stores });
      } finally { database.close(); }
    }
    const result = { type: 'snapshot', label, databases, input: document.querySelector('#new-text')?.value,
      items: document.querySelector('#items')?.innerText, status: window.starter?.status,
      events: [...window.__soakEvents].filter(e => !e.type.startsWith('snapshot')) };
    window.__soakTrace(result);
    return result;
  }, label);
}
export { expect, signIn, signInAgain, synced, uniq, APP, db };
