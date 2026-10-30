// The search (the search recipe's glue, recipes/search.json): full-text search over the tasks with @core/search, with the
// sample operators has:number and is:long. A search icon in the bar, left of sync, opens the box over the bar (the list's
// tools slot, #list-tools); what it finds narrows every tab, and Cancel (or Esc) empties it and closes it. Tapping
// elsewhere closes an empty box (one with words stays, so a narrowed list never hides why). "/" opens it on a computer.
import { createSearch } from '@core/search';
import { icon } from '@core/ui';
import { itemText } from '../items.js';
import { ICONS } from '../icons.js';

/** @typedef {import('../items.js').Item} Item */

/** the box over the bar, its Cancel and its status line; the bar's search icon opens it @param {HTMLElement} slot @param {() => void} redraw */
function drawBox(slot, redraw) {
  const bar = /** @type {HTMLElement} */ (slot.closest('.ui-bar'));
  const open = /** @type {HTMLButtonElement | null} */ (document.getElementById('search-open'));
  const box = document.createElement('div');
  box.id = 'search';
  box.setAttribute('role', 'search');
  const label = Object.assign(document.createElement('label'), { htmlFor: 'q', textContent: 'Search', className: 'visually-hidden' });
  const q = Object.assign(document.createElement('input'), {
    id: 'q', type: 'search', autocomplete: 'off', placeholder: 'Search tasks', title: 'word, "phrase", -leave out, has:number, is:long',
  });
  const cancel = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Cancel', className: 'bar-search-cancel' });
  const msg = Object.assign(document.createElement('p'), { id: 'search-msg', className: 'small' });
  msg.setAttribute('role', 'status');
  box.append(label, q, cancel, msg);
  slot.append(box);

  /** @param {boolean} on @param {boolean} [refocus] back to the search icon (not when a tap elsewhere closed it) */
  const show = (on, refocus = true) => {
    bar?.classList.toggle('is-searching', on);
    if (on) q.focus();
    else { const had = q.value; q.value = ''; msg.textContent = ''; if (had) redraw(); if (refocus) open?.focus(); }
  };
  if (open) { open.append(icon(ICONS.search)); open.hidden = false; open.addEventListener('click', () => show(true)); }
  cancel.addEventListener('click', () => show(false));
  q.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); show(false); } });
  box.addEventListener('focusout', e => {
    if (!q.value.trim() && !box.contains(/** @type {Node | null} */ (e.relatedTarget))) show(false, false);
  });
  return { q, msg, show };
}

/** @type {import('./tasks.js').ListFilter} */
export function listSearch({ slot, redraw }) {
  const { q, msg, show } = drawBox(slot, redraw);
  const search = createSearch({
    fields: ['text'],
    operators: {
      has: (rec, v) => v === 'number' && /\d/.test(itemText(rec)),
      is: (rec, v) => v === 'long' && itemText(rec).length >= 20,
    },
    onReady: redraw,   // MiniSearch came in after a search: search again with it
  });
  /** @type {Map<string, string>} id -> the text as indexed (a new subscription starts with no "changed" ids, so compare) */
  const known = new Map();

  q.addEventListener('input', redraw);
  q.addEventListener('focus', () => void search.prepare(), { once: true });
  document.addEventListener('keydown', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || document.querySelector('dialog[open]')) return;
    e.preventDefault(); show(true);
  });

  return {
    /** keeps the index current: only records whose text changed are fed */
    feed(items) {
      const now = new Set(items.map(i => i.id));
      for (const id of known.keys()) if (!now.has(id)) { search.remove(id); known.delete(id); }
      const stale = items.filter(i => known.get(i.id) !== itemText(i));
      search.feed(stale);
      for (const i of stale) known.set(i.id, itemText(i));
    },
    /** the items the box leaves in, in the order to show them; null with the box empty */
    pick(items) {
      const text = q.value.trim();
      if (!text) { msg.textContent = ''; return null; }
      const { hits, unknown } = search.search(text, { limit: 500 });
      msg.textContent = unknown.length ? `Did you mean ${unknown.map(u => u.suggest).join(', ')}?` : hits.length ? '' : 'No matches';
      const byId = new Map(items.map(i => [i.id, i]));
      return hits.map(h => byId.get(h.id)).filter(/** @returns {i is Item} */ i => !!i);
    },
  };
}
