// Minimal engine regression: two independent listeners may deliver a newer bin tombstone
// before the items listener's older first server snapshot. No engine files are patched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCollectionSync } from '../node_modules/app-sync/src/sync.js';

for (let repeat = 0; repeat < 10; repeat++) test(`B: tombstone must survive delayed first full snapshot (${repeat})`, async () => {
  const row = { id: 'made-up', text: 'deleted item', updatedAt: 100, serverAt: 100 };
  const stored = new Map([[row.id, structuredClone(row)]]);
  let metadata = {}, deliver, shown = [];
  const store = {
    async load() { return { docs: [...stored.values()], meta: metadata }; },
    async write(_coll, { put = [], del = [], meta, replace } = {}) {
      if (replace) stored.clear();
      for (const d of put) stored.set(d.id, structuredClone(d));
      for (const id of del) stored.delete(id);
      if (meta) metadata = structuredClone(meta);
    },
  };
  const engine = createCollectionSync({ scope: '_', coll: 'items', store, stampMode: 'server', now: () => 1000,
    listen(_scope, _coll, _plan, callback) { deliver = callback; return () => {}; },
  });
  try {
    await engine.ready;
    engine.subscribe(list => { shown = list; });
    // Local cache arrives first; the items query's initial server answer is still in flight.
    deliver({ changes: [{ type: 'added', id: row.id, doc: row }], fromCache: true });
    await engine.flush();
    assert.equal(shown.length, 1);
    // A later delete commit is heard through the independent bin feed first.
    await engine.tombs([{ id: row.id, deletedAt: 100 }]);
    assert.equal(engine.tomb(row.id), 100);
    assert.deepEqual(shown, []);
    // The older server answer is the *first* confirmed full snapshot on this listener.
    deliver({ full: true, docs: [row], changes: [], fromCache: false });
    await engine.flush();
    assert.deepEqual(shown, [], 'a known tombstone must reject the deleted version in a delayed full snapshot');
    assert.equal(stored.has(row.id), false, 'the deleted version must not return to the device store');
  } finally { await engine.stop(); }
});
