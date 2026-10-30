// Bulk edit (src/screens/bulk.js): a finger's hold on a task selects it, the bar takes the tab bar's place, and its
// Done, Day, List and Delete act on every ticked task; Upcoming's day groups are one selection.
import { test, expect, signIn, uniq, today, openTab, db } from './fixtures.mjs';

const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return today(d); };
const put = (id, fields) => db.put(`spaces/_/tasks/${id}`, { done: false, createdAt: Date.now(), updatedAt: Date.now(), ...fields });
/** a list of the test's own, picked on the page: other tests' tasks (the same space) stay off its rows */
async function ownList(page, tab) {
  const name = uniq('L'), id = uniq('l');
  await db.put(`spaces/_/lists/${id}`, { name, createdAt: Date.now(), updatedAt: Date.now() });
  await page.locator(`#${tab}-page .list-chip`, { hasText: name }).click();
  return id;
}

/** a finger held on a task's row until its list is in select mode (CDP touch: the hold menus listen for touch). Other
 * tests' saves redraw the rows, and a row redrawn under the finger ends that hold, so it holds again. */
async function hold(page, row) {
  const cdp = await page.context().newCDPSession(page);
  await expect(async () => {
    const b = await row.locator('.task-main').boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(650);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    if (await page.locator('.ui-menu-layer.is-open').count()) await page.keyboard.press('Escape');   // (a menu a redraw opened instead)
    await expect(row).toHaveAttribute('aria-selected', 'true', { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
}

test('hold a task to select; Done ticks every ticked one and the bar goes', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const listId = await ownList(page, 'today');
  const [a, b, c] = [uniq('a'), uniq('b'), uniq('c')];
  for (const t of [a, b, c]) await put(t, { text: t, due: day(0), listId });
  const row = t => page.locator('#today .task-row', { hasText: t });
  await expect(row(c)).toBeVisible();

  await hold(page, row(a));
  await expect(page.locator('#today')).toHaveClass(/is-editing/);
  await expect(row(a)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.sheet-open, dialog[open]')).toHaveCount(0);   // the hold opened nothing
  const bar = page.locator('[data-select-toolbar="#today"]');
  await expect(bar).toBeVisible();
  await expect(page.locator('.ui-tabbar')).toBeHidden();
  await row(b).locator('.task-main').click();
  await expect(bar.locator('[data-select-count]')).toHaveText('2 selected');

  await bar.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(bar).toBeHidden();
  await expect(page.locator('.ui-tabbar')).toBeVisible();
  await expect(row(a)).toHaveCount(0);
  await expect(row(b)).toHaveCount(0);
  await expect(row(c)).toBeVisible();
  await expect.poll(async () => (await db.list('spaces/_/tasks')).filter(d => [a, b].includes(d.text) && d.done).length, { timeout: 15_000 }).toBe(2);
});

test('Upcoming: a selection across day groups moves to Today with Day, and × ends it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await openTab(page, 'upcoming');
  const listId = await ownList(page, 'upcoming');
  const [a, b] = [uniq('a'), uniq('b')];
  await put(a, { text: a, due: day(2), listId });
  await put(b, { text: b, due: day(5), listId });
  const row = t => page.locator('#upcoming .task-row', { hasText: t });
  await expect(row(b)).toBeVisible();

  await hold(page, row(a));
  await expect(row(a)).toHaveAttribute('aria-selected', 'true');
  await row(b).locator('.task-main').click();
  const bar = page.locator('[data-select-toolbar="#upcoming"]');
  await expect(bar.locator('[data-select-count]')).toHaveText('2 selected');
  await bar.getByRole('button', { name: 'Stop selecting' }).click();
  await expect(bar).toBeHidden();
  await expect(row(a)).not.toHaveAttribute('aria-selected', /./);
  // (× takes select mode's Back step away: let it land before the next hold adds one)
  await expect.poll(() => page.evaluate(() => history.state?.uiTransient?.ids?.length ?? 0)).toBe(0);

  await hold(page, row(a));
  await row(b).locator('.task-main').click();
  await bar.getByRole('button', { name: 'Day' }).click();
  await page.getByRole('menuitem', { name: 'Today' }).click();
  await expect(row(a)).toHaveCount(0);
  await expect(row(b)).toHaveCount(0);
  await openTab(page, 'today');
  await expect(page.locator('#today')).toContainText(a);
  await expect(page.locator('#today')).toContainText(b);
});
