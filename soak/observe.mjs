// Test-only trace. Only app-sync item databases are read; Firebase Auth storage is excluded.
import { test as base, expect, signIn, signInAgain, synced, uniq, APP, db as baseDb } from '../e2e/fixtures.mjs';
import fs from 'node:fs';
import path from 'node:path';

// The original helper reads only one 300-document page. Long repeated runs must read every page.
const decode = v => 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue
  : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue
  : 'nullValue' in v ? null : 'arrayValue' in v ? (v.arrayValue.values || []).map(decode)
  : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)])) : undefined;
export const db = { ...baseDb, async list(collection) {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (host !== '127.0.0.1:8101') throw new Error('Soak oracle requires the local demo emulator');
  const result = [];
  let token = '';
  do {
    const url = new URL(`http://${host}/v1/projects/demo-sandbox-app/databases/(default)/documents/${collection}`);
    url.searchParams.set('pageSize', '300');
    if (token) url.searchParams.set('pageToken', token);
    const response = await fetch(url, { headers: { Authorization: 'Bearer owner' } });
    if (!response.ok) throw new Error(`Soak oracle: ${response.status}`);
    const body = await response.json();
    result.push(...(body.documents || []).map(d => Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, decode(v)]))));
    token = body.nextPageToken || '';
  } while (token);
  return result;
} };

export const test = base.extend({
  phone: async ({ phone }, use, info) => {
    const dir = info.outputPath();
    fs.mkdirSync(dir, { recursive: true });
    const log = path.join(dir, `evidence-${info.repeatEachIndex}-${info.title.replace(/[^a-z0-9]+/gi, '-')}.jsonl`);
    let sequence = 0;
    const contexts = [];
    await use(async () => {
      const page = await phone();
      contexts.push(page.context());
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
    if (process.env.SOAK_TRACE && info.status !== info.expectedStatus) {
      for (const context of contexts) for (const page of context.pages()) {
        await snapshot(page, 'failure-teardown').catch(() => {});
      }
    }
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
      items: document.querySelector('#items')?.innerText, status: window.starter?.status, ready: window.starter?.ready,
      events: [...window.__soakEvents].filter(e => !e.type.startsWith('snapshot')) };
    window.__soakTrace(result);
    return result;
  }, label);
}
export { expect, signIn, signInAgain, synced, uniq, APP };
