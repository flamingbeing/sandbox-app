// The optional modules this app has, each wired in by `node tools/add.mjs <recipe>` (README, "Modules"): one import
// and one slot entry per module (a recipe's Settings page goes in `settingsPages`, which shell.js lists as it is), written after the "add:" marks and taken out again by `add.mjs --remove`. A screen
// asks its slot here; an empty slot costs the page nothing.
// add: imports
import { listSearch } from './screens/list-search.js';
import { itemFiles } from './screens/item-files.js';

/** @type {{ listFilter?: import('./screens/tasks.js').ListFilter, itemFiles?: import('./screens/tasks.js').ItemFilesSlot,
 *   settingsPages?: Record<string, import('./shell.js').SettingsSlot> }} */
export const modules = {
  // add: slots
  listFilter: listSearch,
  itemFiles,
  settingsPages: {
    // add: settings pages
  },
};
