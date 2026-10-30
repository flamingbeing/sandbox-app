// The app's own icons for the Settings menu and the bar (Lucide, https://lucide.dev, ISC licence): [tag, attributes] pairs, drawn by
// @core/ui's icon(). Add one by copying its nodes from lucide.dev; never an emoji or a text glyph.
/** @typedef {import('app-ui/icons/lucide.js').IconNodes} IconNodes */

/** @type {Record<string, IconNodes>} */
export const ICONS = {
  listChecks: [['path', { d: 'm3 17 2 2 4-4' }], ['path', { d: 'm3 7 2 2 4-4' }], ['path', { d: 'M13 6h8' }], ['path', { d: 'M13 12h8' }], ['path', { d: 'M13 18h8' }]],
  menu: [['path', { d: 'M4 6h16' }], ['path', { d: 'M4 12h16' }], ['path', { d: 'M4 18h16' }]],
  search: [['circle', { cx: '11', cy: '11', r: '8' }], ['path', { d: 'm21 21-4.34-4.34' }]],
  user: [['path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }], ['circle', { cx: '12', cy: '7', r: '4' }]],
  smartphone: [['rect', { width: '14', height: '20', x: '5', y: '2', rx: '2', ry: '2' }], ['path', { d: 'M12 18h.01' }]],
};
