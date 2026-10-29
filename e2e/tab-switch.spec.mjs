// Tab changes: the top bar (.ui-bar) and its title stay put on every frame of a tap's slide, from a page at the top
// and from a scrolled one; a sideways swipe changes page from the first tab and when it starts on a task row, even
// when the list redraws under the finger.
import { test, expect, signIn, add } from './fixtures.mjs';

const current = page => page.locator('.ui-tabbar .ui-tab[aria-current="page"]');

// the bar's and its title's boxes on each frame for a while (as text, one entry per different box)
const frames = page => page.evaluate(() => new Promise(done => {
  const seen = new Set();
  let n = 0;
  const box = (/** @type {string} */ s) => { const b = /** @type {Element} */ (document.querySelector(s)).getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(v => v.toFixed(1)).join(','); };
  const frame = () => {
    seen.add(`${box('.ui-bar')} ${box('.ui-bar-title')}`);
    if (++n < 30) requestAnimationFrame(frame); else done([...seen]);
  };
  requestAnimationFrame(frame);
}));

test('the top bar does not move on a tab change, from the top or a scrolled page', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  for (let i = 0; i < 16; i++) await add(page, `bar ${i}`);   // a Today long enough to scroll its title under the bar
  const still = (await frames(page))[0];
  const tap = async (/** @type {string} */ name) => {
    const seen = frames(page);
    await page.locator('.ui-tabbar .ui-tab', { hasText: name }).dispatchEvent('click');
    expect(await seen, `bar on the way to ${name}`).toEqual([still]);
    await expect(current(page)).toHaveText(new RegExp(name));
  };
  for (const name of ['Upcoming', 'Done', 'Settings', 'Today']) await tap(name);
  await page.evaluate(() => scrollTo(0, 400));
  await expect(page.locator('.ui-bar')).toHaveClass(/is-collapsed/);
  for (const name of ['Upcoming', 'Today', 'Done', 'Today']) await tap(name);
});

test('a sideways swipe changes page from the first tab and when it starts on a task row', async ({ phone, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit makes no Touch outside a real touch screen');
  const page = await phone();
  await signIn(page, 'member');
  const name = `swipe row ${Date.now()}`;
  await add(page, name);
  // a finger: down, ten moves a frame apart, up; with `save`, a task is saved half-way (the list redraws under the finger)
  const swipe = async (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ dx, save = '') => {
    await page.evaluate(async ([x, y, dx, save]) => {
      const target = /** @type {Element} */ (document.elementFromPoint(x, y));
      const fire = (/** @type {string} */ type, /** @type {number} */ cx) => {
        const t = new Touch({ identifier: 1, target, clientX: cx, clientY: y });
        const up = type === 'touchend';
        target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, composed: true,
          touches: up ? [] : [t], targetTouches: up ? [] : [t], changedTouches: [t] }));
      };
      fire('touchstart', x);
      for (let i = 1; i <= 10; i++) {
        await new Promise(r => requestAnimationFrame(r));
        fire('touchmove', x + dx * i / 10);
        if (save && i === 3) await /** @type {any} */ (window).starter.add(save);
      }
      fire('touchend', x + dx);
    }, /** @type {[number, number, number, string]} */ ([x, y, dx, save]));
    // landed: only the current page is showing (a touch on gliding pages would catch them instead)
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('.ui-screens > .ui-screen:not([hidden])').length)).toBe(1);
  };
  const title = /** @type {{ y: number }} */ (await page.locator('#today-title').boundingBox());
  await swipe(120, title.y + 10, 200);   // nothing before the first page: it stays, and no side bar comes out
  await expect(current(page)).toHaveText(/Today/);
  await expect(page.locator('#side')).not.toBeInViewport();
  await swipe(300, title.y + 10, -200);
  await expect(current(page)).toHaveText(/Upcoming/);
  await swipe(100, 300, 200);
  await expect(current(page)).toHaveText(/Today/);
  // on a row, and a save redraws the list half-way: the row under the finger is a new one by the let-go (other tests'
  // tasks share the list: the row is brought on screen first)
  const li = page.locator('#today li', { hasText: name });
  /** @type {{ y: number, height: number } | null} */
  let row = null;
  await expect(async () => { await li.scrollIntoViewIfNeeded(); row = await li.boundingBox(); expect(row).not.toBeNull(); }).toPass();
  const { y, height } = /** @type {{ y: number, height: number }} */ (/** @type {unknown} */ (row));
  await swipe(300, y + height / 2, -200, `${name} saved mid-swipe`);
  await expect(current(page)).toHaveText(/Upcoming/);
  await expect(page.locator('#today')).toContainText(`${name} saved mid-swipe`);
});
