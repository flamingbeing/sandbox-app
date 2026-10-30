// Bulk edit: press and hold a task to select it, tap more, then act on them together from the bar that takes the tab
// bar's place (Done or Not done, Day, List, Delete). The kit's select mode (@core/ui selectMode) on each tab's list; a
// mouse's right-click opens the row's menu (Edit, Select) and Ctrl/Shift-click selects too. Upcoming's day groups are
// one select list. A redraw while selecting (a sync, another device) keeps the ticks on the tasks still shown; switching
// tab, Back, Esc or the bar's × ends it.
import { selectMode, holdMenus, confirmModal, icon } from '@core/ui';
import { INBOX, REFUSED } from '../items.js';
import { addDays, dayKey, orderedLists } from '../tasks.js';
import { ICONS } from '../icons.js';
import { $ } from '../dom.js';
import { transients } from '../shell.js';

/** @typedef {import('../items.js').Task} Task */

/** the Day menu: [action, words]; the action is days from today, or 'none' */
const DAYS = [['0', 'Today'], ['1', 'Tomorrow'], ['7', 'In a week'], ['none', 'No date']];

/**
 * @param {import('../items.js').ItemsApp} app
 * @param {{ tasks: () => Task[], lists: () => import('../items.js').TaskList[], toast: (s: string) => void,
 *   undo: { show: (s: string, undo: () => void) => void }, files?: { of: (id: string) => unknown[] }, open: (t: Task) => void }} o
 */
export function bulkEdit(app, { tasks, lists, toast, undo, files, open }) {
  const host = /** @type {HTMLElement} */ (document.querySelector('.ui-screens'));
  const menus = holdMenus(host);
  const steps = transients();
  const ids = ['today', 'upcoming', 'done'];
  const modes = new Map(ids.map(id => {
    const list = $(id);
    list.dataset.select = ''; list.dataset.holdSelect = '';
    return [id, selectMode(list, { steps })];
  }));
  const editing = (/** @type {string} */ id) => $(id).classList.contains('is-editing');
  const ticked = (/** @type {string} */ id) => /** @type {Task[]} */ (modes.get(id)?.selected()
    .map(r => tasks().find(t => t.id === r.dataset.id)).filter(Boolean) ?? []);
  const end = () => modes.forEach(m => m.setEditing(false));

  // Upcoming: a hold in a day's group starts the whole tab's select mode, and the groups show the ticks while it is on
  const upcoming = $('upcoming');
  upcoming.addEventListener('ui-edit', e => {
    if (e.target === upcoming) return;
    e.stopPropagation();
    upcoming.dispatchEvent(new CustomEvent('ui-edit', { detail: /** @type {CustomEvent} */ (e).detail }));
  }, true);
  const mirror = () => upcoming.querySelectorAll('.ui-list').forEach(ul => ul.classList.toggle('is-editing', editing('upcoming')));
  upcoming.addEventListener('ui-select', mirror);

  host.addEventListener('ui-tab', end);
  // a mouse's menu on a row: Edit or Select
  host.addEventListener('ui-menu', e => {
    const row = /** @type {HTMLElement} */ (e.target), action = /** @type {CustomEvent} */ (e).detail?.action;
    const t = tasks().find(x => x.id === row.dataset.id);
    if (action === 'edit' && t) open(t);
    if (action === 'select') row.closest('.ui-list')?.dispatchEvent(new CustomEvent('ui-edit', { detail: { row } }));
  });

  /** what one change did to each task: refused ones counted, then the bar closes @param {Task[]} picked
   * @param {(t: Task) => Promise<string | void>} each @param {string} said @param {(() => void)} [back] */
  async function run(picked, each, said, back) {
    end();
    let refused = 0;
    for (const t of picked) if (await each(t)) refused++;
    if (refused) toast(REFUSED);
    else if (back) undo.show(said, back);
    else toast(said);
  }
  const n = (/** @type {number} */ k) => `${k} ${k === 1 ? 'task' : 'tasks'}`;

  for (const id of ids) {
    const bar = /** @type {HTMLElement} */ (document.querySelector(`[data-select-toolbar="#${id}"]`));
    const cancel = /** @type {HTMLButtonElement} */ (bar.querySelector('[data-bulk="cancel"]'));
    cancel.append(icon(ICONS.x));
    bar.addEventListener('click', async e => {
      const b = /** @type {HTMLElement} */ (e.target).closest('[data-bulk]');
      const what = b?.getAttribute('data-bulk'), picked = ticked(id);
      if (what === 'cancel') end();
      else if (what === 'done' || what === 'undone') {
        const done = what === 'done';
        await run(picked, t => app.tick(t, done), `${done ? 'Done' : 'Not done'}: ${n(picked.length)}`, async () => {
          for (const t of picked) { const now = tasks().find(x => x.id === t.id); if (now && await app.tick(now, !done)) toast(REFUSED); }
        });
      } else if (what === 'delete') {
        if (!await confirmModal(`Delete ${n(picked.length)}?`, { title: 'Delete tasks', danger: true, yes: 'Delete' })) return;
        await run(picked, async t => { await app.remove(t, files?.of(t.id) ?? []); }, `Deleted ${n(picked.length)}`);
      } else if (what === 'list' && b) {
        // the List menu: Inbox, then the person's lists (filled now, so a list made a moment ago is there)
        const tpl = /** @type {HTMLTemplateElement} */ ($('bulk-list-menu'));
        tpl.content.replaceChildren(...[[INBOX, 'Inbox'], ...orderedLists(lists()).map(l => [l.id, l.name])].map(([v, word]) =>
          Object.assign(document.createElement('button'), { className: 'ui-menu-item', textContent: word, dataset: { action: `list:${v}` } })));
        menus.open(/** @type {HTMLElement} */ (b));
      } else if (what === 'day' && b) menus.open(/** @type {HTMLElement} */ (b));
    });
    bar.addEventListener('ui-menu', async e => {
      const action = String(/** @type {CustomEvent} */ (e).detail?.action ?? ''), picked = ticked(id);
      if (action.startsWith('list:')) {
        const v = action.slice(5), name = v === INBOX ? 'Inbox' : lists().find(l => l.id === v)?.name ?? 'the list';
        await run(picked, t => app.edit(t, { listId: v === INBOX ? null : v }), `Moved ${n(picked.length)} to ${name}`);
      } else if (DAYS.some(([a]) => a === action)) {
        const due = action === 'none' ? null : addDays(dayKey(), Number(action));
        await run(picked, t => app.edit(t, due ? { due } : { due: null, dueTime: null }), `${n(picked.length)}: ${DAYS.find(([a]) => a === action)?.[1]}`);
      }
    });
  }

  return {
    /** call before a redraw; the returned function, after it, puts back the ticks on the tasks still shown */
    keep() {
      const was = new Map(ids.filter(editing).map(id => [id, new Set(modes.get(id)?.selected().map(r => r.dataset.id))]));
      return () => {
        for (const [id, kept] of was) {
          const list = $(id), rows = /** @type {HTMLElement[]} */ ([...list.querySelectorAll('.ui-row')]);
          const back = rows.filter(r => kept.has(r.dataset.id));
          if (!back.length) { modes.get(id)?.setEditing(false); continue; }
          // the new rows are options as select mode makes them; a "ui-edit" per kept row ticks it and recounts
          for (const r of rows) { r.dataset.role = ''; r.setAttribute('role', 'option'); r.setAttribute('aria-selected', 'false'); }
          for (const row of back) list.dispatchEvent(new CustomEvent('ui-edit', { detail: { row } }));
        }
        mirror();
      };
    },
  };
}
